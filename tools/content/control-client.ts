import { z } from 'zod'

import { controlRequest } from '../control/client'

const sourceCommitSchema = z.string().regex(/^[a-f0-9]{40}$/)
const contentSyncResponseSchema = z.object({
  created: z.boolean(),
  job: z.object({ id: z.uuid(), jobType: z.literal('content_sync') }).passthrough(),
})

export async function createContentSync(sourceCommitInput: string) {
  const sourceCommit = sourceCommitSchema.parse(sourceCommitInput)
  return contentSyncResponseSchema.parse(
    await controlRequest('/api/ops/application-jobs', {
      body: { jobType: 'content_sync', payload: { sourceCommit } },
      idempotencyKey: `content-sync:${sourceCommit}`,
      method: 'POST',
      purpose: 'content-sync-create',
    }),
  )
}
