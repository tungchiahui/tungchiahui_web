import type { Root } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { z } from 'zod'

import { localizeContentText } from './content'
import type { AppLocale } from './locales'

type Replacement = Readonly<{ end: number; start: number; value: string }>

/**
 * Materializes localized Markdown while preserving the canonical source syntax.
 * Only mdast text nodes are replaced, so frontmatter, code, inline code, raw HTML,
 * and link/image destinations never cross the conversion boundary.
 */
export function localizeContentMarkdown(rawMarkdown: string, locale: AppLocale) {
  const source = z.string().min(1).parse(rawMarkdown)
  if (locale === 'zh-cn' || locale === 'en-us') return source

  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .parse(source) as Root
  const replacements: Replacement[] = []
  visit(tree, 'text', (node) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) {
      throw new Error('Markdown parser omitted text-node offsets required for safe localization')
    }
    const value = localizeContentText(node.value, locale)
    if (value !== node.value) replacements.push({ end, start, value })
  })

  return replacements
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (materialized, replacement) =>
        `${materialized.slice(0, replacement.start)}${replacement.value}${materialized.slice(replacement.end)}`,
      source,
    )
}
