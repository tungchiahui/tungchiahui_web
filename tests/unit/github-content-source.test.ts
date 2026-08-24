import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GitHubContentSource } from '../../src/content/github-source'

function blob(contents: string) {
  const buffer = Buffer.from(contents)
  const sha = createHash('sha1')
    .update(Buffer.from(`blob ${buffer.byteLength}\0`))
    .update(buffer)
    .digest('hex')
  return { contents, sha }
}

describe('read-only GitHub content source', () => {
  it('reads an exact tree/blob snapshot exclusively with GET requests', async () => {
    const sourceCommit = 'a'.repeat(40)
    const post = blob('---\ntitle: Post\n---\n\n# Post\n')
    const wiki = blob('---\ntitle: Wiki\n---\n\n# Wiki\n')
    const requests: Readonly<{ method: string; url: string }>[] = []
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = input instanceof URL ? input : new URL(String(input))
      requests.push({ method: init?.method ?? 'GET', url: url.toString() })
      if (url.pathname.endsWith(`/git/trees/${sourceCommit}`)) {
        return Response.json({
          truncated: false,
          tree: [
            { path: 'content/wiki/2026-01-01-Wiki/index.md', sha: wiki.sha, type: 'blob' },
            { path: 'content/posts/2026-01-01-Post.md', sha: post.sha, type: 'blob' },
            { path: 'content/_i18n/en-us/generated.md', sha: post.sha, type: 'blob' },
          ],
        })
      }
      const selected = url.pathname.endsWith(post.sha) ? post : wiki
      return Response.json({
        content: Buffer.from(selected.contents).toString('base64'),
        encoding: 'base64',
        sha: selected.sha,
      })
    }
    const source = new GitHubContentSource({
      apiBaseUrl: 'https://github.invalid',
      fetchImplementation,
      repository: 'owner/content',
    })

    const snapshot = await source.fetchSnapshot(sourceCommit)

    expect(snapshot.files.map((file) => file.path)).toEqual([
      'content/posts/2026-01-01-Post.md',
      'content/wiki/2026-01-01-Wiki/index.md',
    ])
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
    expect(Object.getOwnPropertyNames(GitHubContentSource.prototype).toSorted()).toEqual([
      'constructor',
      'fetchSnapshot',
    ])
  })

  it('rejects a truncated tree before treating missing files as deletes', async () => {
    const source = new GitHubContentSource({
      apiBaseUrl: 'https://github.invalid',
      fetchImplementation: async () => Response.json({ tree: [], truncated: true }),
      repository: 'owner/content',
    })
    await expect(source.fetchSnapshot('b'.repeat(40))).rejects.toThrow('truncated')
  })

  it('never sends a read token to a configurable non-GitHub origin', () => {
    expect(
      () =>
        new GitHubContentSource({
          apiBaseUrl: 'https://example.invalid',
          repository: 'owner/content',
          token: 'read-token',
        }),
    ).toThrow('official GitHub API origin')
  })

  it('contains no AI, build, deploy, or GitHub write implementation in the content path', () => {
    const files = [
      'src/content/github-source.ts',
      'src/content/worker.ts',
      'services/content-worker/main.ts',
    ]
    const source = files
      .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n')
    expect(source).not.toMatch(/from ['"]\.\.\/translation\/provider['"]/)
    expect(source).not.toMatch(/from ['"]node:child_process['"]/)
    expect(source).not.toMatch(/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/)
    expect(source).not.toMatch(/openPullRequest|createCommit|createPullRequest|updateFile/)
  })
})
