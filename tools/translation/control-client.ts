import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import type { TranslationOperationRequest } from '../../src/translation/contracts'
import { controlRequest } from '../control/client'

export async function createTranslationJob(request: TranslationOperationRequest) {
  const configuredKey = process.env.SITE_TRANSLATION_IDEMPOTENCY_KEY
  const idempotencyKey =
    configuredKey === undefined
      ? `translation:cli:${randomUUID()}`
      : z
          .string()
          .min(8)
          .max(200)
          .regex(/^[A-Za-z0-9._:-]+$/)
          .parse(configuredKey)
  return controlRequest('/api/ops/translations', {
    body: request,
    idempotencyKey,
    method: 'POST',
    purpose: 'translation',
  })
}

export async function readTranslationStatus(jobId?: string) {
  return controlRequest(
    jobId === undefined
      ? '/api/ops/translations/status?limit=10'
      : `/api/ops/translations/${z.uuid().parse(jobId)}`,
    { purpose: 'translation-status' },
  )
}

export async function cancelTranslationJob(jobId: string) {
  return controlRequest(`/api/ops/translations/${z.uuid().parse(jobId)}/cancel`, {
    body: {},
    method: 'POST',
    purpose: 'translation-cancel',
  })
}
