import { z } from 'zod'
import { sourceCommitSchema } from '../domain/persistence'
import { gitBlobSha } from '../translation/git-memory'
import { contentSnapshotSchema, type ReadonlyContentSource } from './contracts'

const repositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Expected owner/repository')

const githubTreeSchema = z.object({
  truncated: z.boolean().default(false),
  tree: z.array(
    z.object({
      path: z.string().min(1),
      sha: z.string().regex(/^[a-f0-9]{40}$/),
      type: z.enum(['blob', 'commit', 'tree']),
    }),
  ),
})

const githubBlobSchema = z.object({
  content: z.string(),
  encoding: z.literal('base64'),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
})

export type GitHubContentSourceOptions = Readonly<{
  apiBaseUrl?: string
  fetchImplementation?: typeof fetch
  repository: string
  token?: string
  readCache?: () => Promise<
    Readonly<{
      sourceCommit?: string
      files: readonly { path: string; contents: string; blobSha: string }[]
    }>
  >
}>

function isCanonicalContentPath(path: string) {
  return (
    /^content\/posts\/[^/]+\.md$/.test(path) ||
    /^content\/wiki\/[^/]+\/(?:[^/]+\/)*[^/]+\.md$/.test(path)
  )
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
) {
  const results = new Map<number, R>()
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex
        nextIndex += 1
        const value = values[index]
        if (value === undefined) throw new Error('Content source concurrency index is invalid')
        results.set(index, await transform(value))
      }
    }),
  )
  return values.map((_, index) => {
    const result = results.get(index)
    if (result === undefined) throw new Error('Content source concurrency result is missing')
    return result
  })
}

export class GitHubContentSource implements ReadonlyContentSource {
  readonly #apiBaseUrl: string
  readonly #fetch: typeof fetch
  readonly #headers: Readonly<Record<string, string>>
  readonly #repository: string
  readonly #readCache: GitHubContentSourceOptions['readCache']

  constructor(options: GitHubContentSourceOptions) {
    this.#repository = repositorySchema.parse(options.repository)
    this.#readCache = options.readCache
    const apiBaseUrl = new URL(options.apiBaseUrl ?? 'https://api.github.com')
    if (options.token !== undefined && apiBaseUrl.origin !== 'https://api.github.com') {
      throw new Error('GitHub read token may only be sent to the official GitHub API origin')
    }
    this.#apiBaseUrl = apiBaseUrl.toString().replace(/\/$/, '')
    this.#fetch = options.fetchImplementation ?? fetch
    this.#headers = Object.freeze({
      accept: 'application/vnd.github+json',
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
      'user-agent': 'tungchiahui-content-worker',
      'x-github-api-version': '2022-11-28',
    })
  }

  async #getJson(url: URL): Promise<unknown> {
    const response = await this.#fetch(url, {
      headers: this.#headers,
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`GitHub read failed with HTTP ${response.status}`)
    }
    return response.json() as Promise<unknown>
  }

  async fetchSnapshot(sourceCommitInput: string) {
    const sourceCommit = sourceCommitSchema.parse(sourceCommitInput)
    const cache = await this.#readCache?.()
    const cachedFiles = new Map(cache?.files.map((file) => [file.path, file]))
    const cachedBlobs = new Map(cache?.files.map((file) => [file.blobSha, file]))
    if (cache?.sourceCommit && cache.sourceCommit !== sourceCommit) {
      const comparison = z
        .object({ status: z.enum(['ahead', 'behind', 'diverged', 'identical']) })
        .parse(
          await this.#getJson(
            new URL(
              `${this.#apiBaseUrl}/repos/${this.#repository}/compare/${cache.sourceCommit}...${sourceCommit}`,
            ),
          ),
        )
      if (comparison.status !== 'ahead')
        throw new Error(
          'Content sync target does not advance the applied Git history; publish rollback as a new Git commit',
        )
    }
    const treeUrl = new URL(
      `${this.#apiBaseUrl}/repos/${this.#repository}/git/trees/${sourceCommit}`,
    )
    treeUrl.searchParams.set('recursive', '1')
    const tree = githubTreeSchema.parse(await this.#getJson(treeUrl))
    if (tree.truncated) {
      throw new Error('GitHub returned a truncated tree; refusing an incomplete content snapshot')
    }

    const entries = tree.tree
      .filter(
        (entry) =>
          entry.type === 'blob' &&
          (isCanonicalContentPath(entry.path) ||
            /^translations\/en-us\/.*\.json$/u.test(entry.path)),
      )
      .sort((left, right) => left.path.localeCompare(right.path, 'en'))
    const paths = new Set(entries.map((entry) => entry.path))
    if (paths.size !== entries.length) {
      throw new Error('GitHub content tree contains duplicate canonical paths')
    }

    let filesFetched = 0
    const sourceFiles = await mapWithConcurrency(entries, 8, async (entry) => {
      const cached = cachedFiles.get(entry.path) ?? cachedBlobs.get(entry.sha)
      if (cached?.blobSha === entry.sha && gitBlobSha(cached.contents) === entry.sha)
        return { contents: cached.contents, path: entry.path }
      const blobUrl = new URL(
        `${this.#apiBaseUrl}/repos/${this.#repository}/git/blobs/${entry.sha}`,
      )
      const blob = githubBlobSchema.parse(await this.#getJson(blobUrl))
      if (blob.sha !== entry.sha) {
        throw new Error(`GitHub blob identity mismatch for ${entry.path}`)
      }
      const contents = Buffer.from(blob.content.replaceAll(/\s/g, ''), 'base64')
      if (gitBlobSha(contents) !== entry.sha) {
        throw new Error(`GitHub blob hash mismatch for ${entry.path}`)
      }
      filesFetched += 1
      return {
        contents: new TextDecoder('utf-8', { fatal: true }).decode(contents),
        path: entry.path,
      }
    })

    return contentSnapshotSchema.parse({
      files: sourceFiles.filter((file) => isCanonicalContentPath(file.path)),
      memoryFiles: sourceFiles.filter((file) => !isCanonicalContentPath(file.path)),
      filesFetched,
      sourceCommit,
      ...(cache?.sourceCommit ? { ancestorCommit: cache.sourceCommit } : {}),
    })
  }
}
