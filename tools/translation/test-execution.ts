import { Client } from 'pg'

import { RecordingContentHooks } from '../../src/content/hooks'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import { TranslationControlRepository } from '../../src/control-plane/translation-jobs'
import { TranslationJobRepository, TranslationWorker } from '../../src/translation/jobs'
import { createFakeTranslationProvider } from '../../src/translation/provider'

const actor: ActorIdentity = {
  capabilities: [
    'translation:dry-run',
    'translation:execute',
    'translation:read',
    'translation:cancel',
  ],
  id: 'phase9-integration',
  kind: 'service',
}

async function create(
  control: TranslationControlRepository,
  suffix: string,
  request: Readonly<Record<string, unknown>>,
) {
  return control.create(request, actor, `phase9:translation:${suffix}`)
}

async function runJob(worker: TranslationWorker, jobId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await worker.runOnce()
    if (!result.claimed) throw new Error(`Translation job ${jobId} was not claimable`)
    if (result.jobId === jobId) return result
  }
  throw new Error(`Translation job ${jobId} was not reached in durable queue order`)
}

export async function verifyPhase9Translation(
  connectionString: string,
  controlPlaneDryRunJobId?: string,
) {
  const control = new TranslationControlRepository(connectionString)
  const jobs = new TranslationJobRepository(connectionString)
  const hooks = new RecordingContentHooks()
  const client = new Client({ connectionString })
  await client.connect()

  try {
    const dryProvider = createFakeTranslationProvider({ costUsdPerRequest: 0.01 })
    const dryWorker = new TranslationWorker({
      hooks,
      jobs,
      provider: dryProvider,
      workerId: 'phase9-dry-run-worker',
    })
    const dryRunJobId =
      controlPlaneDryRunJobId ??
      (
        await create(control, 'dry-run', {
          force: false,
          mode: 'dry-run',
          scope: 'pending',
        })
      ).job.id
    const dryResult = await runJob(dryWorker, dryRunJobId)
    if (
      !dryResult.claimed ||
      dryResult.jobId !== dryRunJobId ||
      dryResult.status !== 'completed' ||
      dryResult.progress.plannedSegmentIds.length === 0 ||
      dryResult.progress.estimatedCostUsd <= 0 ||
      dryProvider.getCallCount() !== 0
    ) {
      throw new Error(
        `Dry-run did not produce a zero-call pending estimate: ${JSON.stringify({
          callCount: dryProvider.getCallCount(),
          expectedJobId: dryRunJobId,
          result: dryResult,
        })}`,
      )
    }

    const changed = await create(control, 'changed-scope', {
      force: false,
      mode: 'dry-run',
      scope: 'changed',
    })
    const changedResult = await runJob(dryWorker, changed.job.id)
    if (
      !changedResult.claimed ||
      changedResult.jobId !== changed.job.id ||
      changedResult.progress.plannedSegmentIds.length !== 1 ||
      dryProvider.getCallCount() !== 0
    ) {
      throw new Error('Changed scope did not select only the targeted-patch candidate')
    }

    const article = await create(control, 'article-scope', {
      articleSourcePath: 'content/posts/2026-01-06-新博客启用.md',
      force: false,
      mode: 'dry-run',
      scope: 'article',
    })
    const articleResult = await runJob(dryWorker, article.job.id)
    if (
      !articleResult.claimed ||
      articleResult.jobId !== article.job.id ||
      articleResult.progress.documentsAffected !== 1 ||
      articleResult.progress.plannedSegmentIds.length !== 1
    ) {
      throw new Error('Article scope did not resolve the exact current document')
    }

    const partialProvider = createFakeTranslationProvider({ costUsdPerRequest: 0.01 })
    const partialWorker = new TranslationWorker({
      hooks,
      jobs,
      provider: partialProvider,
      workerId: 'phase9-budget-worker',
    })
    const partial = await create(control, 'budget-partial', {
      budgetUsd: 0.015,
      executionConfirmation: 'EXECUTE_PAID_TRANSLATION',
      force: false,
      mode: 'execute',
      scope: 'pending',
    })
    const partialResult = await runJob(partialWorker, partial.job.id)
    const partialState = await control.get(partial.job.id)
    if (
      !partialResult.claimed ||
      partialResult.status !== 'partial' ||
      partialProvider.getCallCount() !== 1 ||
      partialState?.translation.status !== 'partial' ||
      partialState.translation.completedSegmentCount !== 1 ||
      partialState.translation.remainingSegmentCount < 1 ||
      Number(partialState.translation.actualCostUsd) !== 0.01 ||
      hooks.calls.length < 1
    ) {
      throw new Error('Server budget did not stop before the next request and preserve progress')
    }

    const preservedBefore = await client.query<{ translated_text: string }>(
      `SELECT translated_text FROM app.translation_segments
        WHERE source_text = '# 新博客启用' AND status = 'reviewed' LIMIT 1`,
    )
    let injectRevalidationFailure = true
    const retryHooks = {
      async refreshSearch(input: Parameters<typeof hooks.refreshSearch>[0]) {
        await hooks.refreshSearch(input)
      },
      async revalidatePublicContent(input: Parameters<typeof hooks.revalidatePublicContent>[0]) {
        if (injectRevalidationFailure) {
          injectRevalidationFailure = false
          throw new Error('Injected exact revalidation failure')
        }
        await hooks.revalidatePublicContent(input)
      },
    }
    const retryProvider = createFakeTranslationProvider({ costUsdPerRequest: 0, failCalls: [1] })
    const retryWorker = new TranslationWorker({
      hooks: retryHooks,
      jobs,
      provider: retryProvider,
      workerId: 'phase9-retry-worker',
    })
    const retry = await create(control, 'retry', {
      budgetUsd: 1,
      executionConfirmation: 'EXECUTE_PAID_TRANSLATION',
      force: false,
      mode: 'execute',
      scope: 'pending',
    })
    const providerFailedAttempt = await runJob(retryWorker, retry.job.id)
    if (
      !providerFailedAttempt.claimed ||
      !('retryScheduled' in providerFailedAttempt) ||
      !providerFailedAttempt.retryScheduled
    ) {
      throw new Error('Retryable provider failure did not schedule the durable job retry')
    }
    const revalidationFailedAttempt = await runJob(retryWorker, retry.job.id)
    if (
      !revalidationFailedAttempt.claimed ||
      !('retryScheduled' in revalidationFailedAttempt) ||
      !revalidationFailedAttempt.retryScheduled ||
      revalidationFailedAttempt.progress.completedSegmentIds.length !== 1 ||
      revalidationFailedAttempt.progress.revalidationDocumentIds.length !== 1 ||
      retryProvider.getCallCount() !== 2
    ) {
      throw new Error('Exact revalidation failure did not preserve progress for retry')
    }
    const successfulRetry = await runJob(retryWorker, retry.job.id)
    const retryState = await control.get(retry.job.id)
    const preservedAfter = await client.query<{ translated_text: string }>(
      `SELECT translated_text FROM app.translation_segments
        WHERE source_text = '# 新博客启用' AND status = 'reviewed' LIMIT 1`,
    )
    if (
      !successfulRetry.claimed ||
      successfulRetry.status !== 'completed' ||
      retryState?.operation.attemptCount !== 3 ||
      retryProvider.getCallCount() !== successfulRetry.progress.plannedSegmentIds.length + 1 ||
      preservedAfter.rows[0]?.translated_text !== preservedBefore.rows[0]?.translated_text
    ) {
      throw new Error('Translation retry damaged a previously published reviewed translation')
    }

    const force = await create(control, 'force-all-dry-run', {
      force: true,
      mode: 'dry-run',
      retranslationConfirmation: 'RETRANSLATE',
      scope: 'all',
    })
    const forceResult = await runJob(dryWorker, force.job.id)
    if (
      !forceResult.claimed ||
      forceResult.jobId !== force.job.id ||
      forceResult.progress.plannedSegmentIds.length <=
        dryResult.progress.plannedSegmentIds.length - 1 ||
      dryProvider.getCallCount() !== 0
    ) {
      throw new Error('Confirmed all/force scope did not estimate current translated blocks')
    }

    const cancelled = await create(control, 'cancelled', {
      budgetUsd: 1,
      executionConfirmation: 'EXECUTE_PAID_TRANSLATION',
      force: true,
      mode: 'execute',
      retranslationConfirmation: 'RETRANSLATE',
      scope: 'all',
    })
    await control.cancel(cancelled.job.id, actor)
    const cancelledState = await control.get(cancelled.job.id)
    if (
      cancelledState?.operation.status !== 'cancelled' ||
      cancelledState.translation.status !== 'cancelled'
    ) {
      throw new Error('Queued translation cancellation did not become durable and terminal')
    }

    const audit = await client.query<{
      model: string | null
      provider: string | null
      rows: string
      total_cost: string
    }>(`SELECT count(*) AS rows,
              min(provider) AS provider,
              min(model) AS model,
              sum(cost_usd)::text AS total_cost
         FROM app.translation_segments
        WHERE provider = 'fake'`)
    if (
      Number(audit.rows[0]?.rows) < 1 ||
      audit.rows[0]?.provider !== 'fake' ||
      !audit.rows[0]?.model ||
      Number(audit.rows[0]?.total_cost) < 0
    ) {
      throw new Error('Provider/model/token/cost audit metadata was not persisted safely')
    }
  } finally {
    await client.end()
    await Promise.all([control.close(), jobs.close()])
  }
}
