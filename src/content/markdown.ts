import { createHash } from 'node:crypto'
import { basename, posix } from 'node:path'

import { pinyin } from 'pinyin-pro'
import remarkFrontmatter from 'remark-frontmatter'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { parseDocument } from 'yaml'
import { z } from 'zod'

import {
  contentSnapshotSchema,
  type PreparedContentDocument,
  preparedContentDocumentSchema,
} from './contracts'
import { legacyContentAliases } from './legacy-aliases'

const astNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      children: z.array(astNodeSchema).optional(),
      type: z.string().min(1),
      value: z.unknown().optional(),
    })
    .passthrough(),
)

const markdownRootSchema = z
  .object({
    children: z.array(
      z
        .object({
          type: z.string().min(1),
          value: z.unknown().optional(),
        })
        .passthrough(),
    ),
    type: z.literal('root'),
  })
  .passthrough()

const frontmatterSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    description: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    title: z.string().trim().min(1),
  })
  .strict()

export class ContentRouteCollisionError extends Error {
  override readonly name = 'ContentRouteCollisionError'
  readonly collisions: readonly Readonly<{ routePath: string; sourcePaths: readonly string[] }>[]

  constructor(
    collisions: readonly Readonly<{ routePath: string; sourcePaths: readonly string[] }>[],
  ) {
    super('Canonical content snapshot contains colliding public routes')
    this.collisions = collisions
  }
}

function parseFrontmatter(rawMarkdown: string) {
  const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkRehype)
  const parsedTree = processor.parse(rawMarkdown)
  const markdownTree = markdownRootSchema.parse(parsedTree)
  const firstNode = markdownTree.children[0]
  if (firstNode?.type !== 'yaml' || typeof firstNode.value !== 'string') {
    throw new Error('Canonical Markdown must begin with YAML frontmatter')
  }
  astNodeSchema.parse(processor.runSync(parsedTree))

  const document = parseDocument(firstNode.value, { schema: 'core' })
  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML frontmatter: ${document.errors[0]?.message ?? 'unknown error'}`)
  }
  return frontmatterSchema.parse(document.toJS() as unknown)
}

export function toLegacyPinyinSlug(input: string) {
  const withoutSortPrefix = input.replace(/^\d+\./, '')
  return pinyin(withoutSortPrefix, {
    nonZh: 'consecutive',
    toneType: 'none',
    type: 'array',
  })
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function assertSafeExplicitBlogRoute(routePath: string) {
  if (
    !routePath.startsWith('/blog/') ||
    routePath.includes('..') ||
    /[?#\s]/.test(routePath) ||
    routePath.endsWith('/')
  ) {
    throw new Error(`Invalid explicit Legacy Blog path: ${routePath}`)
  }
  return routePath
}

function blogRoute(sourcePath: string, explicitPath: string | undefined) {
  if (explicitPath !== undefined) {
    const routePath = explicitPath.startsWith('/blog/')
      ? explicitPath
      : `/blog/${explicitPath.replace(/^\/+/, '')}`
    return assertSafeExplicitBlogRoute(routePath)
  }

  const filename = basename(sourcePath, '.md')
  const slug = toLegacyPinyinSlug(filename) || 'post'
  return `/blog/${slug}`
}

function wikiRoute(sourcePath: string) {
  const relativePath = sourcePath.slice('content/wiki/'.length, -'.md'.length)
  const segments = relativePath.split('/')
  if (segments.at(-1) === 'index') {
    segments.pop()
  }
  const slugs = segments.map(toLegacyPinyinSlug)
  if (slugs.length === 0 || slugs.some((slug) => slug.length === 0)) {
    throw new Error(`Unable to compute Legacy Wiki route for ${sourcePath}`)
  }
  return `/wiki/${slugs.join('/')}`
}

function sourceDate(sourcePath: string, frontmatterDate: string | undefined) {
  const candidate =
    frontmatterDate ??
    (sourcePath.startsWith('content/wiki/')
      ? sourcePath.slice('content/wiki/'.length).match(/^\d{4}-\d{2}-\d{2}/)?.[0]
      : basename(sourcePath, '.md').match(/^\d{4}-\d{2}-\d{2}/)?.[0])
  return candidate === undefined ? null : new Date(`${candidate}T00:00:00.000Z`)
}

function prepareDocument(
  sourceCommit: string,
  sourceFile: Readonly<{ contents: string; path: string }>,
) {
  const frontmatter = parseFrontmatter(sourceFile.contents)
  const contentType = sourceFile.path.startsWith('content/posts/') ? 'blog' : 'wiki'
  const rawFrontmatter = Object.fromEntries(
    Object.entries(frontmatter).filter((entry) => entry[1] !== undefined),
  )
  return preparedContentDocumentSchema.parse({
    contentType,
    rawFrontmatter,
    rawMarkdown: sourceFile.contents,
    routePath:
      contentType === 'blog'
        ? blogRoute(sourceFile.path, frontmatter.path)
        : wikiRoute(sourceFile.path),
    sourceCommit,
    sourceHash: createHash('sha256').update(sourceFile.contents).digest('hex'),
    sourcePath: posix.normalize(sourceFile.path),
    sourceUpdatedAt: sourceDate(sourceFile.path, frontmatter.date),
    title: frontmatter.title,
  })
}

function assertUniqueRoutes(documents: readonly PreparedContentDocument[]) {
  const routeSources = new Map<string, string[]>()
  for (const document of documents) {
    const sources = routeSources.get(document.routePath) ?? []
    sources.push(document.sourcePath)
    routeSources.set(document.routePath, sources)
  }
  const collisions = [...routeSources]
    .filter((entry) => entry[1].length > 1)
    .map(([routePath, sourcePaths]) => ({ routePath, sourcePaths: sourcePaths.toSorted() }))
  for (const alias of legacyContentAliases) {
    if (!routeSources.has(alias.canonicalRoute)) continue
    const aliasOwner = routeSources.get(alias.aliasPath)
    if (aliasOwner !== undefined) {
      collisions.push({
        routePath: alias.aliasPath,
        sourcePaths: [...aliasOwner, `approved-alias:${alias.canonicalRoute}`],
      })
    }
  }
  if (collisions.length > 0) {
    throw new ContentRouteCollisionError(collisions)
  }
}

export function prepareContentSnapshot(snapshotInput: unknown) {
  const snapshot = contentSnapshotSchema.parse(snapshotInput)
  const paths = new Set<string>()
  const documents = snapshot.files
    .toSorted((left, right) => left.path.localeCompare(right.path, 'en'))
    .map((file) => {
      if (paths.has(file.path)) {
        throw new Error(`Canonical content snapshot contains duplicate path ${file.path}`)
      }
      paths.add(file.path)
      return prepareDocument(snapshot.sourceCommit, file)
    })
  assertUniqueRoutes(documents)
  return Object.freeze({ documents, sourceCommit: snapshot.sourceCommit })
}
