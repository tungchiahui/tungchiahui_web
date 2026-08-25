import { createHash } from 'node:crypto'

import remarkFrontmatter from 'remark-frontmatter'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { z } from 'zod'

import type { ContentType, JsonValue, Locale } from '../domain/persistence'
import { localizeContentText } from '../i18n/content'
import { localizeContentMarkdown } from '../i18n/content-markdown'

const markdownNodeSchema = z
  .object({
    alt: z.string().optional(),
    children: z.array(z.unknown()).optional(),
    type: z.string().min(1),
    value: z.string().optional(),
  })
  .passthrough()

const sourceDocumentSchema = z
  .object({
    contentType: z.enum(['blog', 'wiki']),
    id: z.uuid(),
    rawFrontmatter: z.record(z.string(), z.json()),
    rawMarkdown: z.string().min(1),
    routePath: z.string().startsWith('/'),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourcePath: z.string().min(1),
    sourceUpdatedAt: z.date().nullable(),
    title: z.string().min(1),
    translations: z.partialRecord(
      z.enum(['zh-hk', 'zh-tw', 'en-us']),
      z
        .object({
          markdown: z.string().min(1),
          sourceHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .nullable(),
        })
        .strict(),
    ),
  })
  .strict()

export type SearchSourceDocument = Readonly<z.infer<typeof sourceDocumentSchema>>

export type SearchProjection = Readonly<{
  body: string
  contentType: ContentType
  documentId: string
  headings: string
  locale: Locale
  metadata: string
  projectionHash: string
  routePath: string
  sourceHash: string
  sourceUpdatedAt: Date | null
  title: string
}>

function normalizedText(parts: readonly string[]) {
  return parts.join(' ').replaceAll(/\s+/gu, ' ').trim()
}

function nodeText(nodeInput: unknown): string {
  const node = markdownNodeSchema.parse(nodeInput)
  if (node.type === 'yaml' || node.type === 'html' || node.type === 'definition') return ''
  const values: string[] = []
  if (
    (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') &&
    node.value !== undefined
  ) {
    values.push(node.value)
  }
  if (node.type === 'image' && node.alt !== undefined) values.push(node.alt)
  for (const child of node.children ?? []) values.push(nodeText(child))
  return normalizedText(values)
}

export function extractSearchableMarkdown(markdownInput: unknown) {
  const markdown = z.string().min(1).max(10_000_000).parse(markdownInput)
  const root = markdownNodeSchema.parse(
    unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).parse(markdown),
  )
  const headings: string[] = []
  const body: string[] = []
  for (const childInput of root.children ?? []) {
    const child = markdownNodeSchema.parse(childInput)
    const text = nodeText(child)
    if (!text) continue
    if (child.type === 'heading') headings.push(text)
    else if (child.type !== 'yaml' && child.type !== 'html' && child.type !== 'definition') {
      body.push(text)
    }
  }
  return Object.freeze({ body: normalizedText(body), headings: normalizedText(headings) })
}

function relevantMetadata(frontmatter: Readonly<Record<string, JsonValue>>, sourcePath: string) {
  const values: string[] = [sourcePath]
  for (const key of ['description', 'category', 'categories', 'tags'] as const) {
    const value = frontmatter[key]
    if (typeof value === 'string') values.push(value)
    else if (Array.isArray(value)) {
      values.push(...value.filter((entry): entry is string => typeof entry === 'string'))
    }
  }
  return normalizedText(values)
}

function localizedMarkdown(document: SearchSourceDocument, locale: Locale) {
  if (locale === 'zh-cn') return document.rawMarkdown
  const materialized = document.translations[locale]
  if (locale === 'en-us') {
    return materialized?.sourceHash === document.sourceHash
      ? materialized.markdown
      : document.rawMarkdown
  }
  return materialized?.markdown ?? localizeContentMarkdown(document.rawMarkdown, locale)
}

export function materializeSearchProjection(documentInput: unknown, locale: Locale) {
  const document = sourceDocumentSchema.parse(documentInput)
  const title = localizeContentText(document.title, locale)
  const metadata = localizeContentText(
    relevantMetadata(document.rawFrontmatter, document.sourcePath),
    locale,
  )
  const searchable = extractSearchableMarkdown(localizedMarkdown(document, locale))
  const projectionHash = createHash('sha256')
    .update(
      JSON.stringify({
        body: searchable.body,
        contentType: document.contentType,
        headings: searchable.headings,
        locale,
        metadata,
        routePath: document.routePath,
        sourceHash: document.sourceHash,
        title,
      }),
    )
    .digest('hex')
  return Object.freeze<SearchProjection>({
    body: searchable.body,
    contentType: document.contentType,
    documentId: document.id,
    headings: searchable.headings,
    locale,
    metadata,
    projectionHash,
    routePath: document.routePath,
    sourceHash: document.sourceHash,
    sourceUpdatedAt: document.sourceUpdatedAt,
    title,
  })
}
