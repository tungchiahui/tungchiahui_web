import { z } from 'zod'

import { legacyContentAliases } from '@/content/legacy-aliases'
import { locales } from '@/i18n/locales'
import type { PublicDocument } from '@/server/public-content'

const chapterOrderPattern = /^(\d{4}(?:-\d{4})*)-/

export type NumberedWikiDocument = Readonly<{
  chapter: string | undefined
  chapterDepth: number
  chapterOrder: string | undefined
  document: PublicDocument
  isIndex: boolean
}>

export type WikiDocumentGroup = Readonly<{
  chapters: readonly NumberedWikiDocument[]
  index: PublicDocument | undefined
  key: string
  title: string
}>

function sourceFilename(sourcePath: string) {
  return sourcePath.split('/').at(-1)?.replace(/\.md$/u, '') ?? ''
}

function parseChapterOrder(document: PublicDocument) {
  return sourceFilename(document.sourcePath).match(chapterOrderPattern)?.[1]
}

export function compareWikiChapterOrders(
  left: Pick<NumberedWikiDocument, 'chapterOrder' | 'document'>,
  right: Pick<NumberedWikiDocument, 'chapterOrder' | 'document'>,
) {
  const leftParts = left.chapterOrder?.split('-').map(Number) ?? []
  const rightParts = right.chapterOrder?.split('-').map(Number) ?? []
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart !== rightPart) return leftPart - rightPart
  }
  return left.document.title.localeCompare(right.document.title)
}

function numberWikiChapters(documents: readonly PublicDocument[]) {
  const entries = documents.map((document) => {
    const chapterOrder = parseChapterOrder(document)
    return {
      chapterOrder,
      document,
      isIndex: sourceFilename(document.sourcePath) === 'index',
    }
  })
  const chapterEntries = entries
    .filter((entry) => !entry.isIndex)
    .toSorted(compareWikiChapterOrders)
  const siblingOrders = new Map<string, Set<number>>()
  for (const entry of chapterEntries) {
    const parts = entry.chapterOrder?.split('-').map(Number) ?? []
    for (const [index, part] of parts.entries()) {
      const parent = parts.slice(0, index).join('-')
      const siblings = siblingOrders.get(parent) ?? new Set<number>()
      siblings.add(part)
      siblingOrders.set(parent, siblings)
    }
  }
  const siblingIndexes = new Map<string, Map<number, number>>()
  for (const [parent, siblings] of siblingOrders) {
    siblingIndexes.set(
      parent,
      new Map(
        [...siblings]
          .toSorted((left, right) => left - right)
          .map((value, index) => [value, index + 1]),
      ),
    )
  }
  return chapterEntries.map((entry): NumberedWikiDocument => {
    const parts = entry.chapterOrder?.split('-').map(Number) ?? []
    const chapter = parts
      .map((part, index) => siblingIndexes.get(parts.slice(0, index).join('-'))?.get(part))
      .filter((part): part is number => part !== undefined)
      .join('.')
    return Object.freeze({
      chapter: chapter || undefined,
      chapterDepth: Math.max(0, parts.length - 1),
      chapterOrder: entry.chapterOrder,
      document: entry.document,
      isIndex: false,
    })
  })
}

export function wikiDocumentKey(document: PublicDocument) {
  return document.sourcePath.split('/')[2] ?? document.sourcePath
}

export function groupWikiDocuments(
  documents: readonly PublicDocument[],
): readonly WikiDocumentGroup[] {
  const grouped = Map.groupBy(documents, wikiDocumentKey)
  return Object.freeze(
    [...grouped.entries()]
      .map(([key, entries]): WikiDocumentGroup => {
        const index = entries.find((entry) => sourceFilename(entry.sourcePath) === 'index')
        return Object.freeze({
          chapters: Object.freeze(numberWikiChapters(entries)),
          index,
          key,
          title: index?.title ?? entries[0]?.title ?? key,
        })
      })
      .toSorted((left, right) => {
        const leftDate = left.index?.sourceUpdatedAt?.getTime() ?? 0
        const rightDate = right.index?.sourceUpdatedAt?.getTime() ?? 0
        return rightDate - leftDate || left.title.localeCompare(right.title)
      }),
  )
}

export function documentDate(document: PublicDocument) {
  const frontmatterDate = document.rawFrontmatter.date
  if (typeof frontmatterDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(frontmatterDate)) {
    return frontmatterDate
  }
  const filenameDate = sourceFilename(document.sourcePath).match(/^\d{4}-\d{2}-\d{2}/u)?.[0]
  return filenameDate ?? document.sourceUpdatedAt?.toISOString().slice(0, 10)
}

export function documentSummary(document: PublicDocument) {
  const description = document.rawFrontmatter.description
  if (typeof description === 'string' && description.trim()) return description.trim()
  const markdown = document.localizedMarkdown ?? document.rawMarkdown
  const body = markdown
    .replace(/^---[\s\S]*?---/u, '')
    .replace(/```[\s\S]*?```/gu, '')
    .replace(/^#{1,6}\s+.*$/gmu, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[`*_>~|-]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
  if (!body) return undefined
  return body.length > 160 ? `${body.slice(0, 157).trimEnd()}…` : body
}

export function trafficPaths(routePathInput: string) {
  const routePath = z.string().startsWith('/').min(2).parse(routePathInput)
  const canonical =
    legacyContentAliases.find((entry) => entry.aliasPath === routePath)?.canonicalRoute ?? routePath
  const aliases = legacyContentAliases
    .filter((entry) => entry.canonicalRoute === canonical)
    .map((entry) => entry.aliasPath)
  const logicalPaths = [canonical, ...aliases]
  const localized = logicalPaths.flatMap((path) => [
    path,
    ...locales.map((locale) => `/${locale}${path}`),
  ])
  return Object.freeze([...new Set(localized)].toSorted())
}
