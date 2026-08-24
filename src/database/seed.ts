import { sql } from 'drizzle-orm'

import {
  applicationJobRequestSchema,
  documentWriteSchema,
  ownerDatasetWriteSchema,
} from '../domain/persistence'
import { createDatabaseClient } from './client'
import {
  documents,
  documentTranslations,
  ingestionRuns,
  operationalJobs,
  ownerManagedDatasets,
  translationJobs,
  translationSegments,
} from './schema'

const seedTimestamp = new Date('2026-01-01T00:00:00.000Z')
const sourceCommit = '1111111111111111111111111111111111111111'
const blogId = '10000000-0000-4000-8000-000000000001'
const wikiId = '10000000-0000-4000-8000-000000000002'
const ingestionJobId = '20000000-0000-4000-8000-000000000001'
const translationJobId = '20000000-0000-4000-8000-000000000002'
const ingestionRunId = '30000000-0000-4000-8000-000000000001'
const segmentId = '40000000-0000-4000-8000-000000000001'
const sourceHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const wikiHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const translationHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

export async function seedDevelopmentDatabase(connectionString: string) {
  const client = createDatabaseClient({
    applicationName: 'site-development-seed',
    connectionString,
    maxConnections: 2,
  })
  const blog = documentWriteSchema.parse({
    id: blogId,
    contentType: 'blog',
    sourcePath: 'content/posts/2026-01-01-phase-3-seed.md',
    sourceCommit,
    title: 'Phase 3 Development Seed',
    rawFrontmatter: { title: 'Phase 3 Development Seed', path: '/blog/phase-3-seed' },
    rawMarkdown: '# Phase 3 Development Seed\n\nDeterministic local content.',
    sourceHash,
    routePath: '/blog/phase-3-seed',
    sourceUpdatedAt: seedTimestamp,
  })
  const wiki = documentWriteSchema.parse({
    id: wikiId,
    contentType: 'wiki',
    sourcePath: 'content/wiki/2026-01-01-phase-3-seed/index.md',
    sourceCommit,
    title: 'Phase 3 Wiki Seed',
    rawFrontmatter: { title: 'Phase 3 Wiki Seed' },
    rawMarkdown: '# Phase 3 Wiki Seed\n\nDeterministic local wiki content.',
    sourceHash: wikiHash,
    routePath: '/wiki/2026-01-01-phase-3-seed',
    sourceUpdatedAt: seedTimestamp,
  })
  const ingestionRequest = applicationJobRequestSchema.parse({
    jobType: 'content_sync',
    payload: { sourceCommit },
  })
  const translationRequest = applicationJobRequestSchema.parse({
    jobType: 'translation',
    payload: { translationJobId },
  })
  const techFootprint = ownerDatasetWriteSchema.parse({
    datasetKey: 'tech_footprint',
    payload: { entries: [] },
    revision: 0,
    updatedBy: 'phase3-seed',
  })
  const weightLoss = ownerDatasetWriteSchema.parse({
    datasetKey: 'weight_loss',
    payload: { entries: [] },
    revision: 0,
    updatedBy: 'phase3-seed',
  })

  try {
    await client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      await transaction
        .insert(documents)
        .values([
          { ...blog, createdAt: seedTimestamp, ingestedAt: seedTimestamp },
          { ...wiki, createdAt: seedTimestamp, ingestedAt: seedTimestamp },
        ])
        .onConflictDoNothing()
      await transaction
        .insert(operationalJobs)
        .values([
          {
            id: ingestionJobId,
            jobType: ingestionRequest.jobType,
            status: 'completed',
            requestedBy: 'phase3-seed',
            idempotencyKey: 'phase3-seed-content-sync',
            payload: ingestionRequest.payload,
            progress: { completed: true },
            createdAt: seedTimestamp,
            startedAt: seedTimestamp,
            finishedAt: seedTimestamp,
          },
          {
            id: translationJobId,
            jobType: translationRequest.jobType,
            status: 'completed',
            requestedBy: 'phase3-seed',
            idempotencyKey: 'phase3-seed-translation',
            payload: translationRequest.payload,
            progress: { completed: true },
            createdAt: seedTimestamp,
            startedAt: seedTimestamp,
            finishedAt: seedTimestamp,
          },
        ])
        .onConflictDoNothing()
      await transaction
        .insert(ingestionRuns)
        .values({
          id: ingestionRunId,
          operationalJobId: ingestionJobId,
          sourceCommit,
          startedAt: seedTimestamp,
          finishedAt: seedTimestamp,
          status: 'completed',
          filesSeen: 2,
          filesChanged: 2,
          filesDeleted: 0,
        })
        .onConflictDoNothing()
      await transaction
        .insert(translationJobs)
        .values({
          id: translationJobId,
          status: 'completed',
          scope: 'article',
          documentId: blogId,
          requestedBy: 'phase3-seed',
          budgetUsd: '0',
          createdAt: seedTimestamp,
          startedAt: seedTimestamp,
          finishedAt: seedTimestamp,
        })
        .onConflictDoNothing()
      await transaction
        .insert(translationSegments)
        .values({
          id: segmentId,
          sourceHash,
          sourceText: 'Deterministic local content.',
          sourceAstType: 'paragraph',
          locale: 'en-us',
          translatedText: 'Deterministic local content.',
          contextFingerprint: 'phase3-seed-paragraph',
          status: 'reviewed',
          provider: 'fake',
          model: 'phase3-seed',
          createdAt: seedTimestamp,
          updatedAt: seedTimestamp,
        })
        .onConflictDoNothing()
      await transaction
        .insert(documentTranslations)
        .values({
          documentId: blogId,
          locale: 'en-us',
          translatedMarkdown: '# Phase 3 Development Seed\n\nDeterministic local content.',
          translationHash,
          translationVersion: 1,
          generatedAt: seedTimestamp,
        })
        .onConflictDoNothing()
      await transaction
        .insert(ownerManagedDatasets)
        .values([
          { ...techFootprint, updatedAt: seedTimestamp },
          { ...weightLoss, updatedAt: seedTimestamp },
        ])
        .onConflictDoNothing()
    })
  } finally {
    await client.close()
  }
}
