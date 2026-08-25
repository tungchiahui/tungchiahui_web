import { createHash } from 'node:crypto'

import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { z } from 'zod'

import { contentGlossary } from '../i18n/content-glossary'

export const translationNormalizationVersion = 1

const pointSchema = z.object({ offset: z.number().int().nonnegative() }).passthrough()
const positionSchema = z
  .object({
    end: pointSchema,
    start: pointSchema,
  })
  .passthrough()

type AstNode = {
  align?: unknown | undefined
  children?: AstNode[] | undefined
  depth?: unknown | undefined
  lang?: unknown | undefined
  meta?: unknown | undefined
  position?: unknown | undefined
  title?: unknown | undefined
  type: string
  url?: unknown | undefined
  value?: unknown | undefined
}

const astNodeSchema: z.ZodType<AstNode> = z.lazy(() =>
  z
    .object({
      align: z.unknown().optional(),
      children: z.array(astNodeSchema).optional(),
      depth: z.unknown().optional(),
      lang: z.unknown().optional(),
      meta: z.unknown().optional(),
      position: positionSchema.optional(),
      title: z.unknown().optional(),
      type: z.string().min(1),
      url: z.unknown().optional(),
      value: z.unknown().optional(),
    })
    .passthrough(),
)

const rootSchema = z
  .object({
    children: z.array(astNodeSchema),
    type: z.literal('root'),
  })
  .passthrough()

export const semanticTranslationBlockSchema = z
  .object({
    contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    endOffset: z.number().int().positive(),
    isTranslatable: z.boolean(),
    normalizationVersion: z.literal(translationNormalizationVersion),
    ordinal: z.number().int().nonnegative(),
    protectedValues: z.array(z.string()),
    sourceAstType: z.string().min(1),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceText: z.string().min(1),
    startOffset: z.number().int().nonnegative(),
    structureFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((block) => block.endOffset > block.startOffset, 'Block offsets must be increasing')

export type SemanticTranslationBlock = Readonly<z.infer<typeof semanticTranslationBlockSchema>>

export const targetedPatchContextSchema = z
  .object({
    newSource: z.string().min(1),
    oldSource: z.string().min(1),
    oldTranslation: z.string().min(1),
  })
  .strict()

export type TargetedPatchContext = Readonly<z.infer<typeof targetedPatchContextSchema>>

const nontranslatableAstTypes = new Set(['code', 'definition', 'html', 'thematicBreak', 'yaml'])
const dynamicProtectedPattern =
  /https?:\/\/[^\s<>()]+|[A-Za-z][A-Za-z0-9]*(?:[._:/#@+-][A-Za-z0-9]+)+/gu

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = z.record(z.string(), z.unknown()).parse(value)
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeSource(value: string) {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

function semanticStructure(node: z.infer<typeof astNodeSchema>): unknown {
  const attributes: Record<string, unknown> = { type: node.type }
  for (const key of ['align', 'depth', 'lang', 'meta', 'title', 'url'] as const) {
    if (node[key] !== undefined) attributes[key] = node[key]
  }
  if (node.type === 'code' || node.type === 'html' || node.type === 'inlineCode') {
    attributes.value = node.value
  }
  if (node.children !== undefined) {
    attributes.children = node.children.map((child) =>
      semanticStructure(astNodeSchema.parse(child)),
    )
  }
  return attributes
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function protectedTextPattern() {
  const terms = contentGlossary.protectedTerms
    .toSorted((left, right) => right.length - left.length)
    .map(escapeRegExp)
  return new RegExp(`${terms.join('|')}|${dynamicProtectedPattern.source}`, 'gu')
}

function collectProtectedValues(node: z.infer<typeof astNodeSchema>, output: string[]) {
  if (
    (node.type === 'code' || node.type === 'html' || node.type === 'inlineCode') &&
    typeof node.value === 'string'
  ) {
    output.push(`${node.type}:${node.value}`)
  }
  if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
    if (typeof node.url === 'string') output.push(`${node.type}:url:${node.url}`)
    if (typeof node.title === 'string') output.push(`${node.type}:title:${node.title}`)
  }
  if (node.type === 'text' && typeof node.value === 'string') {
    output.push(
      ...[...node.value.matchAll(protectedTextPattern())].map((match) => `text:${match[0]}`),
    )
  }
  for (const child of node.children ?? []) {
    collectProtectedValues(astNodeSchema.parse(child), output)
  }
}

function parseMarkdown(value: string) {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .parse(value)
  return rootSchema.parse(tree)
}

function blockDetails(node: z.infer<typeof astNodeSchema>) {
  const protectedValues: string[] = []
  collectProtectedValues(node, protectedValues)
  const structureFingerprint = sha256(canonicalJson(semanticStructure(node)))
  return Object.freeze({
    protectedValues: Object.freeze(protectedValues),
    structureFingerprint,
  })
}

export function segmentMarkdownForTranslation(input: unknown) {
  const source = z.string().min(1).parse(input)
  const root = parseMarkdown(source)
  return Object.freeze(
    root.children.map((node, ordinal) => {
      const position = positionSchema.parse(node.position)
      const startOffset = position.start.offset
      const endOffset = position.end.offset
      const sourceText = source.slice(startOffset, endOffset)
      if (sourceText.length === 0) throw new Error(`Empty Markdown block at ordinal ${ordinal}`)
      const normalizedSource = normalizeSource(sourceText)
      const details = blockDetails(node)
      return Object.freeze(
        semanticTranslationBlockSchema.parse({
          contextFingerprint: sha256(
            canonicalJson({
              protectedValues: details.protectedValues,
              sourceAstType: node.type,
              structureFingerprint: details.structureFingerprint,
            }),
          ),
          endOffset,
          isTranslatable: !nontranslatableAstTypes.has(node.type),
          normalizationVersion: translationNormalizationVersion,
          ordinal,
          protectedValues: [...details.protectedValues],
          sourceAstType: node.type,
          sourceHash: sha256(`${translationNormalizationVersion}\0${normalizedSource}`),
          sourceText,
          startOffset,
          structureFingerprint: details.structureFingerprint,
        }),
      )
    }),
  )
}

export function isSafeTranslationCandidate(
  blockInput: unknown,
  translatedTextInput: unknown,
): boolean {
  const block = semanticTranslationBlockSchema.parse(blockInput)
  const translatedText = z.string().min(1).parse(translatedTextInput)
  if (!block.isTranslatable) return translatedText === block.sourceText
  try {
    const translatedRoot = parseMarkdown(translatedText)
    if (translatedRoot.children.length !== 1) return false
    const translatedNode = translatedRoot.children[0]
    if (!translatedNode) return false
    const details = blockDetails(translatedNode)
    return (
      details.structureFingerprint === block.structureFingerprint &&
      canonicalJson(details.protectedValues) === canonicalJson(block.protectedValues)
    )
  } catch {
    return false
  }
}

export function materializeTranslatedMarkdown(
  sourceInput: unknown,
  blocksInput: readonly unknown[],
  translations: ReadonlyMap<number, string>,
) {
  const source = z.string().min(1).parse(sourceInput)
  const blocks = blocksInput.map((block) => semanticTranslationBlockSchema.parse(block))
  let cursor = 0
  let output = ''
  for (const block of blocks) {
    if (block.startOffset < cursor || block.endOffset > source.length) {
      throw new Error(`Invalid or overlapping Markdown block at ordinal ${block.ordinal}`)
    }
    output += source.slice(cursor, block.startOffset)
    const translated = translations.get(block.ordinal)
    output +=
      translated !== undefined && isSafeTranslationCandidate(block, translated)
        ? translated
        : source.slice(block.startOffset, block.endOffset)
    cursor = block.endOffset
  }
  return output + source.slice(cursor)
}

export function createTargetedPatchContext(input: unknown): TargetedPatchContext {
  return Object.freeze(targetedPatchContextSchema.parse(input))
}
