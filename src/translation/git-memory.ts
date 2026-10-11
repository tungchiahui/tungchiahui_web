import { createHash } from 'node:crypto'
import { z } from 'zod'
import { isSafeTranslationCandidate, segmentMarkdownForTranslation } from './segmentation'

export const memoryManifestPath = 'translations/en-us/manifest.json'
export const memoryManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    normalizationVersion: z.literal(1),
    sourceLocale: z.literal('zh-cn'),
    targetLocale: z.literal('en-us'),
    layout: z.literal('sha256-prefix-2'),
  })
  .strict()
export const defaultMemoryManifest = memoryManifestSchema.parse({
  schemaVersion: 1,
  normalizationVersion: 1,
  sourceLocale: 'zh-cn',
  targetLocale: 'en-us',
  layout: 'sha256-prefix-2',
})
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const databaseText = z
  .string()
  .refine((value) => !value.includes('\0'), 'Translation memory text cannot contain NUL')
const databaseTokenCount = z.number().int().nonnegative().max(2_147_483_647)
export const memoryEntrySchema = z
  .object({
    normalizationVersion: z.literal(1),
    sourceHash: hashSchema,
    contextFingerprint: hashSchema,
    sourceText: databaseText.min(1).max(1_000_000),
    translatedText: databaseText.min(1).max(1_000_000),
    provider: databaseText.min(1).max(100),
    model: databaseText.min(1).max(200),
    usage: z
      .object({
        inputTokens: databaseTokenCount,
        outputTokens: databaseTokenCount,
        costUsd: z.number().finite().nonnegative().max(999_999.999999),
      })
      .strict(),
  })
  .strict()
export type GitMemoryEntry = Readonly<z.infer<typeof memoryEntrySchema>>
export const memoryShardSchema = z
  .object({ schemaVersion: z.literal(1), entries: z.record(hashSchema, memoryEntrySchema) })
  .strict()
export const sourceCacheVersion = 1
export const gitMemorySyncMetricsSchema = z.object({
  entriesChanged: z.number().int().nonnegative(),
  shardsChanged: z.number().int().nonnegative(),
  documentsMaterialized: z.number().int().nonnegative(),
  filesFetched: z.number().int().nonnegative(),
  error: z.string().nullable(),
})

export function memoryEntryKey(
  entry: Pick<GitMemoryEntry, 'normalizationVersion' | 'sourceHash' | 'contextFingerprint'>,
) {
  return createHash('sha256')
    .update(
      `${entry.normalizationVersion}\0en-us\0${entry.sourceHash}\0${entry.contextFingerprint}`,
    )
    .digest('hex')
}
export function memoryShardPath(key: string) {
  return `translations/en-us/v1/${hashSchema.parse(key).slice(0, 2)}.json`
}
export function isMemorySourcePath(path: string) {
  return path === memoryManifestPath || /^translations\/en-us\/v1\/[a-f0-9]{2}\.json$/u.test(path)
}
export function gitBlobSha(contents: string | Buffer) {
  const bytes = typeof contents === 'string' ? Buffer.from(contents) : contents
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.byteLength}\0`))
    .update(bytes)
    .digest('hex')
}
export function validateMemoryEntry(key: string, input: unknown): GitMemoryEntry {
  const entry = memoryEntrySchema.parse(input)
  const blocks = segmentMarkdownForTranslation(entry.sourceText)
  const block = blocks.length === 1 ? blocks[0] : undefined
  if (
    !block ||
    !block.isTranslatable ||
    block.sourceHash !== entry.sourceHash ||
    block.contextFingerprint !== entry.contextFingerprint ||
    memoryEntryKey(entry) !== key ||
    !isSafeTranslationCandidate(block, entry.translatedText)
  ) {
    throw new Error('Git translation entry failed identity or protected Markdown validation')
  }
  return entry
}
export function parseMemoryShard(path: string, contents: string) {
  if (
    !/^translations\/en-us\/v1\/[a-f0-9]{2}\.json$/u.test(path) ||
    Buffer.byteLength(contents) > 16_000_000
  )
    throw new Error('Invalid translation shard path or size')
  const shard = memoryShardSchema.parse(JSON.parse(contents) as unknown)
  if (Object.keys(shard.entries).length > 10_000)
    throw new Error('Translation shard exceeds entry limit')
  for (const [key, value] of Object.entries(shard.entries)) {
    if (memoryShardPath(key) !== path) throw new Error('Translation entry belongs to another shard')
    validateMemoryEntry(key, value)
  }
  return shard
}
export function serializeMemoryShard(entries: Readonly<Record<string, GitMemoryEntry>>) {
  return `${JSON.stringify({ schemaVersion: 1, entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'en'))) }, null, 2)}\n`
}
