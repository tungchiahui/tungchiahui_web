import { z } from 'zod'

export const releaseRepository = 'tungchiahui/tungchiahui_web'
export const releaseEnvironment = 'production'
export const releaseWorkflowPath = '.github/workflows/release.yml'
export const publishedReleaseSchema = z
  .object({
    version: z.literal(1),
    gitSha: z.string().regex(/^[a-f0-9]{40}$/),
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    serviceSha: z.string().regex(/^[a-f0-9]{40}$/),
    recoverySha: z.string().regex(/^[a-f0-9]{40}$/),
    runId: z.number().int().positive(),
    automatic: z.boolean(),
  })
  .strict()
export type PublishedRelease = z.infer<typeof publishedReleaseSchema>
export const publishedDeploymentSchema = z.object({
  id: z.number().int().positive(),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  environment: z.literal(releaseEnvironment),
  creator: z.object({ login: z.literal('github-actions[bot]') }),
  payload: publishedReleaseSchema,
})
export const publicReleaseReceiptSchema = z.object({
  gitSha: publishedReleaseSchema.shape.gitSha,
  imageDigest: publishedReleaseSchema.shape.imageDigest,
  serviceSha: publishedReleaseSchema.shape.serviceSha,
  recoverySha: publishedReleaseSchema.shape.recoverySha,
  manifestVersion: z.literal(2),
})

export const configureReleasePullTargetSchema = z
  .object({
    action: z.literal('configure-release-pull'),
    enabled: z.boolean(),
    confirmation: z.literal('RELEASE-PULL-PRODUCTION'),
  })
  .strict()
