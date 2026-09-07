import rehypeShiki from '@shikijs/rehype'
import type { Root } from 'mdast'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { z } from 'zod'

import { localizeContentText } from '@/i18n/content'
import type { AppLocale } from '@/i18n/locales'

import { resolveMarkdownAsset } from './assets'

export type MarkdownHeading = Readonly<{
  depth: number
  id: string
  level: number
  number: string
  text: string
}>
export type RenderedMarkdown = Readonly<{
  headings: readonly MarkdownHeading[]
  html: string
  readingMinutes: number
}>

function headingId(text: string, usedIds: Map<string, number>) {
  const base =
    text
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  const occurrence = usedIds.get(base) ?? 0
  usedIds.set(base, occurrence + 1)
  return occurrence === 0 ? base : `${base}-${occurrence + 1}`
}

function stripTags(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function numberHeadings(
  headings: readonly Readonly<{ depth: number; id: string; text: string }>[],
) {
  let rootCount = 0
  const stack: Array<{ childCount: number; depth: number; parts: number[] }> = []
  return headings.map((heading): MarkdownHeading => {
    while ((stack.at(-1)?.depth ?? 0) >= heading.depth) stack.pop()
    const parent = stack.at(-1)
    let parts: number[]
    if (parent) {
      parent.childCount += 1
      parts = [...parent.parts, parent.childCount]
    } else {
      rootCount += 1
      parts = [rootCount]
    }
    const level = parts.length - 1
    stack.push({ childCount: 0, depth: heading.depth, parts })
    return { ...heading, level, number: parts.join('.') }
  })
}

function enhanceHtml(html: string) {
  const headings: Array<Readonly<{ depth: number; id: string; text: string }>> = []
  const usedIds = new Map<string, number>()
  let enhanced = html.replace(
    /<h([1-6])>([\s\S]*?)<\/h\1>/g,
    (_match, depthText: string, contents: string) => {
      const text = stripTags(contents).trim()
      const id = headingId(text, usedIds)
      headings.push({ depth: Number(depthText), id, text })
      return `<h${depthText} id="${id}">${contents}</h${depthText}>`
    },
  )
  enhanced = enhanced.replace(
    /<a href="(https?:\/\/[^"]+)"/g,
    '<a href="$1" rel="noopener noreferrer" target="_blank"',
  )
  enhanced = enhanced.replace(
    /<a href="([^"]+\.(?:pdf|zip|tar|gz|docx?|xlsx?|pptx?))"/giu,
    '<a href="$1" data-attachment="true"',
  )
  enhanced = enhanced.replace(
    /<img([^>]*?)src="([^"]+)"([^>]*)>/g,
    (match, before: string, source: string, after: string) => {
      const asset = resolveMarkdownAsset(source)
      if (!asset) return match.replace(/\ssrc="[^"]+"/, '')
      return `<img${before}src="${asset.url}"${after} loading="lazy" decoding="async" data-asset-origin="${asset.origin}" data-cache-policy="${asset.cachePolicy}">`
    },
  )
  enhanced = enhanced.replace(
    /<table>([\s\S]*?)<\/table>/g,
    '<div class="table-scroll"><table>$1</table></div>',
  )
  const numberedHeadings = Object.freeze(numberHeadings(headings))
  const headingNumbers = new Map(numberedHeadings.map((heading) => [heading.id, heading.number]))
  enhanced = enhanced.replace(
    /<h([1-6]) id="([^"]+)">([\s\S]*?)<\/h\1>/g,
    (match, depthText: string, id: string, contents: string) => {
      const number = headingNumbers.get(id)
      if (!number) return match
      return `<h${depthText} id="${id}"><a class="heading-number" href="#${id}">${number}.</a><span>${contents}</span><a aria-hidden="true" class="heading-permalink" href="#${id}" tabindex="-1">#</a></h${depthText}>`
    },
  )
  return { headings: numberedHeadings, html: enhanced }
}

function remarkLocaleContent(locale: AppLocale) {
  return () => (tree: Root) => {
    visit(tree, 'text', (node) => {
      node.value = localizeContentText(node.value, locale)
    })
  }
}

export async function renderMarkdown(
  rawMarkdown: string,
  locale: AppLocale = 'zh-cn',
): Promise<RenderedMarkdown> {
  const source = z.string().min(1).parse(rawMarkdown)
  const rendered = await unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkLocaleContent(locale))
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeShiki, {
      defaultColor: false,
      themes: { dark: 'github-dark', light: 'github-light' },
    })
    .use(rehypeStringify)
    .process(source)
  const enhanced = enhanceHtml(String(rendered))

  const readableCharacters = source
    .replace(/^---[\s\S]*?---/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s/g, '').length

  return Object.freeze({
    headings: enhanced.headings,
    html: enhanced.html,
    readingMinutes: Math.max(1, Math.ceil(readableCharacters / 500)),
  })
}
