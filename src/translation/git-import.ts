import { createHash } from 'node:crypto'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import {
  contentSourceFiles,
  documentTranslationSegments,
  gitTranslationEntries,
  translationSegments,
} from '../database/schema'
import {
  type GitMemoryEntry,
  gitBlobSha,
  isMemorySourcePath,
  memoryManifestPath,
  memoryManifestSchema,
  parseMemoryShard,
  sourceCacheVersion,
} from './git-memory'
import type { DatabaseTransaction } from './memory'
import { segmentMarkdownForTranslation } from './segmentation'

type SourceFile = Readonly<{ path: string; contents: string }>
export function planGitMemoryImport(
  files: readonly SourceFile[],
  cached: readonly SourceFile[],
  previouslyEnabled: boolean,
) {
  const manifest = files.find((file) => file.path === memoryManifestPath)
  const enabled = manifest !== undefined || previouslyEnabled
  if (!enabled && files.length === 0)
    return {
      enabled: false,
      changedShards: [] as string[],
      records: [] as { key: string; path: string; entry: GitMemoryEntry }[],
      files,
    }
  if (manifest) memoryManifestSchema.parse(JSON.parse(manifest.contents) as unknown)
  else if (files.length > 0) throw new Error('Translation memory requires its versioned manifest')
  if (
    new Set(files.map((file) => file.path)).size !== files.length ||
    files.some((file) => !isMemorySourcePath(file.path))
  )
    throw new Error('Invalid or duplicate translation memory paths')
  const cache = new Map(cached.map((file) => [file.path, file.contents]))
  const changedShards = new Set(
    cached
      .filter(
        (file) =>
          file.path !== memoryManifestPath &&
          !files.some((incoming) => incoming.path === file.path),
      )
      .map((file) => file.path),
  )
  const records: { key: string; path: string; entry: GitMemoryEntry }[] = []
  for (const file of files) {
    if (
      file.path === memoryManifestPath ||
      (cache.get(file.path) === file.contents && previouslyEnabled)
    )
      continue
    changedShards.add(file.path)
    for (const [key, entry] of Object.entries(parseMemoryShard(file.path, file.contents).entries))
      records.push({ key, path: file.path, entry })
  }
  return { enabled, changedShards: [...changedShards], records, files }
}

export async function applyGitMemoryImport(
  transaction: DatabaseTransaction,
  plan: ReturnType<typeof planGitMemoryImport>,
  previouslyEnabled: boolean,
) {
  const changedSegments = new Set<string>()
  if (!plan.enabled) return { documentIds: new Set<string>(), entriesChanged: 0, shardsChanged: 0 }
  const tracked = await transaction.select().from(gitTranslationEntries)
  const previous = new Map(tracked.map((record) => [record.key, record]))
  const presentKeys = new Set(plan.records.map((record) => record.key))
  const removed = tracked.filter(
    (record) => plan.changedShards.includes(record.shardPath) && !presentKeys.has(record.key),
  )
  for (const record of removed) {
    await transaction
      .update(translationSegments)
      .set({ status: 'pending', translatedText: null, updatedAt: new Date() })
      .where(eq(translationSegments.id, record.segmentId))
    await transaction.delete(gitTranslationEntries).where(eq(gitTranslationEntries.key, record.key))
    changedSegments.add(record.segmentId)
  }
  for (const { key, path, entry } of plan.records) {
    const recordHash = createHash('sha256').update(JSON.stringify(entry)).digest('hex')
    if (previous.get(key)?.recordHash === recordHash) continue
    const block = segmentMarkdownForTranslation(entry.sourceText)[0]
    if (!block) throw new Error('Validated memory entry has no source block')
    const values = {
      sourceHash: entry.sourceHash,
      sourceText: entry.sourceText,
      sourceAstType: block.sourceAstType,
      locale: 'en-us' as const,
      translatedText: entry.translatedText,
      isTranslatable: true,
      normalizationVersion: entry.normalizationVersion,
      contextFingerprint: entry.contextFingerprint,
      status: 'translated' as const,
      provider: entry.provider,
      model: entry.model,
      inputTokens: entry.usage.inputTokens,
      outputTokens: entry.usage.outputTokens,
      costUsd: String(entry.usage.costUsd),
      updatedAt: new Date(),
    }
    const segment = (
      await transaction
        .insert(translationSegments)
        .values(values)
        .onConflictDoUpdate({
          target: [
            translationSegments.sourceHash,
            translationSegments.locale,
            translationSegments.contextFingerprint,
          ],
          set: values,
        })
        .returning({ id: translationSegments.id })
    )[0]
    if (!segment) throw new Error('Git translation entry was not persisted')
    await transaction
      .insert(gitTranslationEntries)
      .values({ key, shardPath: path, segmentId: segment.id, recordHash })
      .onConflictDoUpdate({
        target: gitTranslationEntries.key,
        set: { shardPath: path, segmentId: segment.id, recordHash },
      })
    changedSegments.add(segment.id)
  }
  if (!previouslyEnabled) {
    const imported = await transaction
      .select({ segmentId: gitTranslationEntries.segmentId })
      .from(gitTranslationEntries)
    const ids = imported.map((record) => record.segmentId)
    const invalidated = await transaction
      .update(translationSegments)
      .set({ status: 'pending', translatedText: null, updatedAt: new Date() })
      .where(
        and(
          eq(translationSegments.isTranslatable, true),
          inArray(translationSegments.status, ['translated', 'reviewed']),
          ...(ids.length ? [notInArray(translationSegments.id, ids)] : []),
        ),
      )
      .returning({ id: translationSegments.id })
    for (const row of invalidated) changedSegments.add(row.id)
  }
  const documentIds = new Set<string>()
  if (changedSegments.size) {
    const references = await transaction
      .select({ documentId: documentTranslationSegments.documentId })
      .from(documentTranslationSegments)
      .where(inArray(documentTranslationSegments.segmentId, [...changedSegments]))
    for (const reference of references) documentIds.add(reference.documentId)
  }
  const current = new Set(plan.files.map((file) => file.path))
  const oldFiles = await transaction
    .select({ path: contentSourceFiles.path })
    .from(contentSourceFiles)
    .where(sql`${contentSourceFiles.path} LIKE 'translations/en-us/%'`)
  const deletedPaths = oldFiles.map((row) => row.path).filter((path) => !current.has(path))
  if (deletedPaths.length)
    await transaction
      .delete(contentSourceFiles)
      .where(inArray(contentSourceFiles.path, deletedPaths))
  for (const file of plan.files) {
    await transaction
      .insert(contentSourceFiles)
      .values({ ...file, blobSha: gitBlobSha(file.contents), cacheVersion: sourceCacheVersion })
      .onConflictDoUpdate({
        target: contentSourceFiles.path,
        set: {
          contents: file.contents,
          blobSha: gitBlobSha(file.contents),
          cacheVersion: sourceCacheVersion,
        },
        setWhere: sql`${contentSourceFiles.blobSha} <> ${gitBlobSha(file.contents)} OR ${contentSourceFiles.cacheVersion} <> ${sourceCacheVersion}`,
      })
  }
  return {
    documentIds,
    entriesChanged: changedSegments.size,
    shardsChanged: plan.changedShards.length,
  }
}
