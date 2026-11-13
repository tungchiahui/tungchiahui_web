import { z } from 'zod'
import {
  type PublishedRelease,
  publishedDeploymentSchema,
  publishedReleaseSchema,
} from '../../src/host-release/publication-contracts'
import { githubReleaseRequest } from './github-publications'

export async function publishRelease(
  input: PublishedRelease,
  token: string,
  request: typeof fetch = fetch,
) {
  const publication = publishedReleaseSchema.parse(input)
  const existing = z
    .array(z.unknown())
    .parse(
      await githubReleaseRequest(
        `deployments?environment=production&ref=${publication.gitSha}&per_page=20`,
        token,
        undefined,
        request,
      ),
    )
    .map((value) => publishedDeploymentSchema.safeParse(value))
    .find(
      (value) =>
        value.success && JSON.stringify(value.data.payload) === JSON.stringify(publication),
    )
  const deployment = existing?.success
    ? existing.data
    : z.object({ id: z.number().int().positive() }).parse(
        await githubReleaseRequest(
          'deployments',
          token,
          {
            ref: publication.gitSha,
            environment: 'production',
            auto_merge: false,
            required_contexts: [],
            production_environment: true,
            description: 'Verified immutable release publication',
            payload: publication,
          },
          request,
        ),
      )
  const statuses = z
    .array(z.object({ state: z.string() }))
    .parse(
      await githubReleaseRequest(
        `deployments/${deployment.id}/statuses?per_page=1`,
        token,
        undefined,
        request,
      ),
    )
  if (statuses.length === 0)
    await githubReleaseRequest(
      `deployments/${deployment.id}/statuses`,
      token,
      {
        state: 'pending',
        description: 'Images published; awaiting server execution',
        auto_inactive: false,
      },
      request,
    )
  return {
    publicationId: deployment.id,
    gitSha: publication.gitSha,
    imageDigest: publication.imageDigest,
    state: 'published',
  }
}
async function main() {
  const publication = publishedReleaseSchema.parse({
    version: 1,
    gitSha: process.env.RELEASE_SHA,
    imageDigest: process.env.RELEASE_DIGEST,
    serviceSha: process.env.SERVICE_SOURCE_SHA,
    recoverySha: process.env.RECOVERY_SOURCE_SHA,
    runId: Number(process.env.GITHUB_RUN_ID),
    automatic:
      process.env.GITHUB_EVENT_NAME === 'push' && process.env.DEPLOYMENT_ENABLED === 'true',
  })
  console.log(
    JSON.stringify(
      await publishRelease(publication, z.string().min(1).parse(process.env.GITHUB_TOKEN)),
    ),
  )
}
if (process.argv[1]?.endsWith('/publish-release.ts'))
  void main().catch(() => {
    console.error('Immutable release publication failed')
    process.exitCode = 1
  })
