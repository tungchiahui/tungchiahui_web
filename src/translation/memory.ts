import { createHash } from 'node:crypto'

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { createDatabaseClient } from '../database/client'
import {
  documentTranslationSegments,
  documentTranslations,
  documentTranslationFields as translationFields,
  translationSegments,
} from '../database/schema'
import {
  documentFieldSourceHash,
  documentFieldTranslationVersion,
  documentTranslationFields,
  type TranslatedFields,
  titleTextFromBlock,
  translatedFieldsSchema,
} from './document-fields'
import type { SemanticTranslationBlock } from './segmentation'
import {
  isSafeTranslationCandidate,
  materializeTranslatedMarkdown,
  segmentMarkdownForTranslation,
  translationNormalizationVersion,
} from './segmentation'

type DatabaseClient = ReturnType<typeof createDatabaseClient>
export type DatabaseTransaction = Parameters<
  Parameters<DatabaseClient['database']['transaction']>[0]
>[0]
type TranslationSegment = typeof translationSegments.$inferSelect

type ExistingMapping = Readonly<{
  contextFingerprint: string
  id: string
  ordinal: number
  previousSegmentId: string | null
  segment: TranslationSegment
  sourceEnd: number
  sourceStart: number
}>

type PlannedMapping = Readonly<{
  block: SemanticTranslationBlock
  previousSegmentId: string | null
  segment: TranslationSegment
}>

export type EnglishMaterializationMetrics = Readonly<{
  fallbackSegmentCount: number
  pendingSegmentCount: number
  translatedSegmentCount: number
  translationMemoryHits: number
}>

export type EnglishMaterializationResult = Readonly<{
  changed: boolean
  metrics: EnglishMaterializationMetrics
  translatedMarkdown: string
}>

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function memoryKey(sourceHash: string, contextFingerprint: string) {
  return `${sourceHash}:${contextFingerprint}`
}

function mappingMatches(existing: readonly ExistingMapping[], planned: readonly PlannedMapping[]) {
  if (existing.length !== planned.length) return false
  return planned.every((mapping, index) => {
    const current = existing[index]
    return (
      current?.ordinal === mapping.block.ordinal &&
      current.segment.id === mapping.segment.id &&
      current.previousSegmentId === mapping.previousSegmentId &&
      current.sourceStart === mapping.block.startOffset &&
      current.sourceEnd === mapping.block.endOffset
    )
  })
}

function pickPreviousMapping(
  block: SemanticTranslationBlock,
  existing: readonly ExistingMapping[],
  usedMappingIds: ReadonlySet<string>,
) {
  const candidates = existing.filter(
    (mapping) =>
      !usedMappingIds.has(mapping.id) && mapping.segment.sourceAstType === block.sourceAstType,
  )
  const sameOrdinal = candidates.filter((mapping) => mapping.ordinal === block.ordinal)
  if (sameOrdinal.length === 1) return sameOrdinal[0]
  return candidates.length === 1 ? candidates[0] : undefined
}

async function ensureSegment(
  transaction: DatabaseTransaction,
  block: SemanticTranslationBlock,
  candidatesByKey: Map<string, TranslationSegment>,
) {
  const key = memoryKey(block.sourceHash, block.contextFingerprint)
  const candidate = candidatesByKey.get(key)
  if (candidate) {
    if (
      block.isTranslatable &&
      (candidate.status === 'translated' || candidate.status === 'reviewed') &&
      candidate.translatedText !== null &&
      !isSafeTranslationCandidate(block, candidate.translatedText)
    ) {
      const repaired = (
        await transaction
          .update(translationSegments)
          .set({ status: 'pending', translatedText: null, updatedAt: new Date() })
          .where(eq(translationSegments.id, candidate.id))
          .returning()
      )[0]
      if (!repaired) throw new Error(`Unable to quarantine invalid translation ${candidate.id}`)
      candidatesByKey.set(key, repaired)
      return repaired
    }
    if (candidate.status === 'stale' && block.isTranslatable) {
      const reactivated = (
        await transaction
          .update(translationSegments)
          .set({ status: 'pending', updatedAt: new Date() })
          .where(eq(translationSegments.id, candidate.id))
          .returning()
      )[0]
      if (!reactivated) throw new Error(`Unable to reactivate translation ${candidate.id}`)
      candidatesByKey.set(key, reactivated)
      return reactivated
    }
    return candidate
  }

  const inserted = (
    await transaction
      .insert(translationSegments)
      .values({
        contextFingerprint: block.contextFingerprint,
        isTranslatable: block.isTranslatable,
        locale: 'en-us',
        normalizationVersion: block.normalizationVersion,
        sourceAstType: block.sourceAstType,
        sourceHash: block.sourceHash,
        sourceText: block.sourceText,
        status: block.isTranslatable ? 'pending' : 'reviewed',
        translatedText: block.isTranslatable ? null : block.sourceText,
      })
      .onConflictDoNothing()
      .returning()
  )[0]
  const resolved =
    inserted ??
    (
      await transaction
        .select()
        .from(translationSegments)
        .where(
          and(
            eq(translationSegments.sourceHash, block.sourceHash),
            eq(translationSegments.locale, 'en-us'),
            eq(translationSegments.contextFingerprint, block.contextFingerprint),
          ),
        )
        .limit(1)
    )[0]
  if (!resolved) throw new Error(`Unable to persist translation segment ${block.sourceHash}`)
  candidatesByKey.set(key, resolved)
  return resolved
}

async function readExistingMappings(transaction: DatabaseTransaction, documentId: string) {
  const rows = await transaction
    .select({
      contextFingerprint: translationSegments.contextFingerprint,
      id: documentTranslationSegments.id,
      ordinal: documentTranslationSegments.ordinal,
      previousSegmentId: documentTranslationSegments.previousSegmentId,
      segment: translationSegments,
      sourceEnd: documentTranslationSegments.sourceEnd,
      sourceStart: documentTranslationSegments.sourceStart,
    })
    .from(documentTranslationSegments)
    .innerJoin(
      translationSegments,
      eq(documentTranslationSegments.segmentId, translationSegments.id),
    )
    .where(
      and(
        eq(documentTranslationSegments.documentId, documentId),
        eq(documentTranslationSegments.locale, 'en-us'),
      ),
    )
    .orderBy(asc(documentTranslationSegments.ordinal))
  return rows.map((row) => Object.freeze(row))
}

async function staleSupersededPendingSegments(
  transaction: DatabaseTransaction,
  previousSegmentIds: readonly string[],
) {
  if (previousSegmentIds.length === 0) return
  await transaction
    .update(translationSegments)
    .set({ status: 'stale', updatedAt: new Date() })
    .where(
      and(
        inArray(translationSegments.id, previousSegmentIds),
        eq(translationSegments.status, 'pending'),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${documentTranslationSegments}
          WHERE ${documentTranslationSegments.segmentId} = ${translationSegments.id}
        )`,
        sql`NOT EXISTS (SELECT 1 FROM ${translationFields} WHERE ${translationFields.segmentId} = ${translationSegments.id})`,
      ),
    )
}

export async function reconcileEnglishTranslation(
  transaction: DatabaseTransaction,
  input: Readonly<{
    documentId: string
    rawMarkdown: string
    sourceHash: string
    sourcePath: string
    timestamp: Date
  }>,
): Promise<EnglishMaterializationResult> {
  const documentId = z.uuid().parse(input.documentId)
  const sourceHash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(input.sourceHash)
  const blocks = segmentMarkdownForTranslation(input.rawMarkdown)
  const existingMappings = await readExistingMappings(transaction, documentId)
  const fields = documentTranslationFields(input.rawMarkdown, input.sourcePath)
  const fieldSourceHash = documentFieldSourceHash(fields[0]?.sourceText ?? '', input.sourcePath)
  const sourceHashes = [
    ...new Set([...blocks, ...fields.map((field) => field.block)].map((block) => block.sourceHash)),
  ]
  const candidates =
    sourceHashes.length === 0
      ? []
      : await transaction
          .select()
          .from(translationSegments)
          .where(
            and(
              eq(translationSegments.locale, 'en-us'),
              inArray(translationSegments.sourceHash, sourceHashes),
            ),
          )
  const candidatesByKey = new Map(
    candidates.map((candidate) => [
      memoryKey(candidate.sourceHash, candidate.contextFingerprint),
      candidate,
    ]),
  )
  const existingByKey = new Map<string, ExistingMapping[]>()
  for (const mapping of existingMappings) {
    const key = memoryKey(mapping.segment.sourceHash, mapping.contextFingerprint)
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), mapping])
  }
  const usedMappingIds = new Set<string>()
  const planned: PlannedMapping[] = []

  for (const block of blocks) {
    const segment = await ensureSegment(transaction, block, candidatesByKey)
    const exactCandidates = existingByKey.get(memoryKey(block.sourceHash, block.contextFingerprint))
    const exact =
      exactCandidates?.find(
        (mapping) => mapping.ordinal === block.ordinal && !usedMappingIds.has(mapping.id),
      ) ?? exactCandidates?.find((mapping) => !usedMappingIds.has(mapping.id))
    if (exact) usedMappingIds.add(exact.id)
    const previous =
      exact === undefined ? pickPreviousMapping(block, existingMappings, usedMappingIds) : undefined
    if (previous) usedMappingIds.add(previous.id)
    planned.push(
      Object.freeze({
        block,
        previousSegmentId:
          exact?.previousSegmentId ??
          (previous !== undefined && previous.segment.id !== segment.id
            ? previous.segment.id
            : null),
        segment,
      }),
    )
  }

  const mappingsChanged = !mappingMatches(existingMappings, planned)
  if (mappingsChanged) {
    const supersededPendingIds = existingMappings.map((mapping) => mapping.segment.id)
    await transaction
      .delete(documentTranslationSegments)
      .where(
        and(
          eq(documentTranslationSegments.documentId, documentId),
          eq(documentTranslationSegments.locale, 'en-us'),
        ),
      )
    if (planned.length > 0) {
      await transaction.insert(documentTranslationSegments).values(
        planned.map((mapping) => ({
          documentId,
          locale: 'en-us' as const,
          ordinal: mapping.block.ordinal,
          previousSegmentId: mapping.previousSegmentId,
          segmentId: mapping.segment.id,
          sourceEnd: mapping.block.endOffset,
          sourceStart: mapping.block.startOffset,
          updatedAt: input.timestamp,
        })),
      )
    }
    await staleSupersededPendingSegments(transaction, supersededPendingIds)
  }

  const translatedBlocks = new Map<number, string>()
  let translatedSegmentCount = 0
  const fieldMappings = await transaction
    .select()
    .from(translationFields)
    .where(eq(translationFields.documentId, documentId))
  const localizedFields: { -readonly [K in keyof TranslatedFields]: TranslatedFields[K] } = {}
  let fieldsChanged = false
  for (const field of fields) {
    const segment = await ensureSegment(transaction, field.block, candidatesByKey)
    const previous = fieldMappings.find((mapping) => mapping.field === field.field)
    if (previous?.segmentId !== segment.id) {
      fieldsChanged = true
      await transaction
        .insert(translationFields)
        .values({ documentId, locale: 'en-us', field: field.field, segmentId: segment.id })
        .onConflictDoUpdate({
          target: [translationFields.documentId, translationFields.locale, translationFields.field],
          set: { segmentId: segment.id },
        })
    }
    if (
      segment.translatedText !== null &&
      (segment.status === 'translated' || segment.status === 'reviewed') &&
      isSafeTranslationCandidate(field.block, segment.translatedText)
    ) {
      localizedFields[field.field] = titleTextFromBlock(segment.translatedText)
    }
  }
  const retiredFields = fieldMappings.filter(
    (mapping) => !fields.some((field) => field.field === mapping.field),
  )
  if (retiredFields.length) {
    fieldsChanged = true
    for (const mapping of retiredFields)
      await transaction
        .delete(translationFields)
        .where(
          and(
            eq(translationFields.documentId, documentId),
            eq(translationFields.field, mapping.field),
          ),
        )
  }
  await staleSupersededPendingSegments(
    transaction,
    fieldMappings.map((mapping) => mapping.segmentId),
  )
  for (const mapping of planned) {
    const translatedText = mapping.segment.translatedText
    if (
      mapping.block.isTranslatable &&
      translatedText !== null &&
      (mapping.segment.status === 'translated' || mapping.segment.status === 'reviewed') &&
      isSafeTranslationCandidate(mapping.block, translatedText)
    ) {
      translatedBlocks.set(mapping.block.ordinal, translatedText)
      translatedSegmentCount += 1
    }
  }
  const translatableSegmentCount = planned.filter((mapping) => mapping.block.isTranslatable).length
  const fallbackSegmentCount = translatableSegmentCount - translatedSegmentCount
  const pendingSegmentCount = planned.filter(
    (mapping) => mapping.block.isTranslatable && mapping.segment.status === 'pending',
  ).length
  const translatedMarkdown = materializeTranslatedMarkdown(
    input.rawMarkdown,
    blocks,
    translatedBlocks,
  )
  const translationHash = sha256(translatedMarkdown)
  const metrics = Object.freeze({
    fallbackSegmentCount,
    pendingSegmentCount,
    translatedSegmentCount,
    translationMemoryHits: translatedSegmentCount,
  })
  const existingMaterialization = (
    await transaction
      .select()
      .from(documentTranslations)
      .where(
        and(
          eq(documentTranslations.documentId, documentId),
          eq(documentTranslations.locale, 'en-us'),
        ),
      )
      .limit(1)
  )[0]
  const materializationChanged =
    existingMaterialization?.sourceHash !== sourceHash ||
    existingMaterialization.translatedMarkdown !== translatedMarkdown ||
    existingMaterialization.translationHash !== translationHash ||
    existingMaterialization.translationVersion !== translationNormalizationVersion ||
    existingMaterialization.pendingSegmentCount !== pendingSegmentCount ||
    existingMaterialization.translatedSegmentCount !== translatedSegmentCount ||
    existingMaterialization.fallbackSegmentCount !== fallbackSegmentCount ||
    existingMaterialization.translationMemoryHits !== translatedSegmentCount ||
    existingMaterialization.fieldTranslationVersion !== documentFieldTranslationVersion ||
    existingMaterialization.fieldSourceHash !== fieldSourceHash ||
    JSON.stringify(translatedFieldsSchema.parse(existingMaterialization.translatedFields)) !==
      JSON.stringify(localizedFields)

  if (materializationChanged) {
    await transaction
      .insert(documentTranslations)
      .values({
        documentId,
        translatedFields: localizedFields,
        fieldTranslationVersion: documentFieldTranslationVersion,
        fieldSourceHash,
        fallbackSegmentCount,
        generatedAt: input.timestamp,
        locale: 'en-us',
        pendingSegmentCount,
        sourceHash,
        translatedMarkdown,
        translatedSegmentCount,
        translationHash,
        translationMemoryHits: translatedSegmentCount,
        translationVersion: translationNormalizationVersion,
      })
      .onConflictDoUpdate({
        target: [documentTranslations.documentId, documentTranslations.locale],
        set: {
          translatedFields: localizedFields,
          fieldTranslationVersion: documentFieldTranslationVersion,
          fieldSourceHash,
          fallbackSegmentCount,
          generatedAt: input.timestamp,
          pendingSegmentCount,
          sourceHash,
          translatedMarkdown,
          translatedSegmentCount,
          translationHash,
          translationMemoryHits: translatedSegmentCount,
          translationVersion: translationNormalizationVersion,
        },
      })
  }

  return Object.freeze({
    changed: mappingsChanged || fieldsChanged || materializationChanged,
    metrics,
    translatedMarkdown,
  })
}

export async function retireEnglishTranslations(
  transaction: DatabaseTransaction,
  documentIdsInput: readonly unknown[],
) {
  const documentIds = documentIdsInput.map((documentId) => z.uuid().parse(documentId))
  if (documentIds.length === 0) return
  const mappings = await transaction
    .select({ segmentId: documentTranslationSegments.segmentId })
    .from(documentTranslationSegments)
    .where(
      and(
        inArray(documentTranslationSegments.documentId, documentIds),
        eq(documentTranslationSegments.locale, 'en-us'),
      ),
    )
  await transaction
    .delete(documentTranslationSegments)
    .where(
      and(
        inArray(documentTranslationSegments.documentId, documentIds),
        eq(documentTranslationSegments.locale, 'en-us'),
      ),
    )
  const fields = await transaction
    .select()
    .from(translationFields)
    .where(inArray(translationFields.documentId, documentIds))
  await transaction
    .delete(translationFields)
    .where(inArray(translationFields.documentId, documentIds))
  await staleSupersededPendingSegments(
    transaction,
    [...mappings, ...fields].map((mapping) => mapping.segmentId),
  )
}
