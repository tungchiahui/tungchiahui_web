import { createHash } from 'node:crypto'
import type { Heading, Root } from 'mdast'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { z } from 'zod'

import { parseFrontmatter } from '../content/markdown'
import remarkContentMath from '../content/remark-math'
import { segmentMarkdownForTranslation } from './segmentation'

export const translatedFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(10_000).optional(),
    wikiGroupTitle: z.string().trim().min(1).max(10_000).optional(),
  })
  .strict()
export type TranslatedFields = Readonly<z.infer<typeof translatedFieldsSchema>>
export const documentFieldTranslationVersion = 1
export const translationFieldSchema = z.enum(['title', 'wikiGroupTitle'])

export function wikiGroupSourceTitle(sourcePath: string) {
  return sourcePath.startsWith('content/wiki/')
    ? sourcePath.split('/')[2]?.replace(/^\d{4}-\d{2}-\d{2}-/u, '')
    : undefined
}

export function documentFieldSourceHash(title: string, sourcePath: string) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: title.trim(),
        wikiGroupTitle: wikiGroupSourceTitle(sourcePath) ?? null,
      }),
    )
    .digest('hex')
}

// An ordinary standalone heading uses the existing validated AST/memory format.
// These blocks are mapped separately and never inserted into author Markdown.
export function titleTranslationBlock(title: string) {
  const text = z
    .string()
    .trim()
    .min(1)
    .max(10_000)
    .refine((value) => !/\0/u.test(value))
    .transform((value) => value.replaceAll(/\s+/gu, ' '))
    .parse(title)
  const escapeText = (value: string) => value.replace(/[\\`*_{}[\]<>|#$!.+~-]/gu, '\\$&')
  const raw = `# ${text}`
  const tree = unified().use(remarkParse).use(remarkContentMath).parse(raw)
  const protectedRanges: { start: number; end: number }[] = []
  visit(tree, (node) => {
    if (node.type !== 'inlineMath' && node.type !== 'math' && node.type !== 'inlineCode') return
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start !== undefined && end !== undefined && start >= 2)
      protectedRanges.push({ start: start - 2, end: end - 2 })
  })
  let escaped = ''
  let cursor = 0
  for (const range of protectedRanges.toSorted((a, b) => a.start - b.start)) {
    const literal = text.slice(range.start, range.end)
    const fence = '`'.repeat(
      Math.max(1, ...[...literal.matchAll(/`+/gu)].map((match) => match[0].length + 1)),
    )
    escaped += `${escapeText(text.slice(cursor, range.start))}${fence} ${literal} ${fence}`
    cursor = range.end
  }
  escaped += escapeText(text.slice(cursor))
  const block = segmentMarkdownForTranslation(`# ${escaped}`)[0]
  if (!block) throw new Error('Missing title translation block')
  return block
}

export function titleTextFromBlock(markdown: string) {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  if (tree.children.length !== 1 || tree.children[0]?.type !== 'heading')
    throw new Error('Title translation must contain exactly one heading')
  const parts: string[] = []
  visit(tree.children[0] as Heading, (node) => {
    if (node.type === 'text' || node.type === 'inlineCode') parts.push(node.value)
  })
  return z.string().trim().min(1).max(10_000).parse(parts.join(''))
}

export function documentTranslationFields(rawMarkdown: string, sourcePath: string) {
  const frontmatter = parseFrontmatter(rawMarkdown)
  const group = wikiGroupSourceTitle(sourcePath)
  return [
    {
      field: 'title' as const,
      sourceText: frontmatter.title,
      block: titleTranslationBlock(frontmatter.title),
    },
    ...(group
      ? [
          {
            field: 'wikiGroupTitle' as const,
            sourceText: group,
            block: titleTranslationBlock(group),
          },
        ]
      : []),
  ]
}
