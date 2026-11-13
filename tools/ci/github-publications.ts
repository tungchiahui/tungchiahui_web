import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import {
  publishedDeploymentSchema,
  releaseRepository,
} from '../../src/host-release/publication-contracts'

export async function githubReleaseRequest(
  path: string,
  token: string,
  body?: unknown,
  request: typeof fetch = fetch,
  repository: string = releaseRepository,
): Promise<unknown> {
  if (!token) throw new Error('GitHub publication credential is required')
  const attempts = body === undefined ? 3 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20000),
      })
      if (response.ok) return await response.json()
      if (response.status !== 429 && response.status < 500)
        throw new Error(`Permanent GitHub publication rejection HTTP ${response.status}`)
      if (attempt + 1 === attempts)
        throw new Error(`GitHub publication request returned HTTP ${response.status}`)
    } catch (error) {
      if (
        attempt + 1 === attempts ||
        (error instanceof Error && error.message.startsWith('Permanent GitHub'))
      )
        throw error
    }
    await delay(250 * (attempt + 1))
  }
  throw new Error('GitHub publication retries exhausted')
}
export async function confirmedPublication(
  token: string,
  request: typeof fetch = fetch,
  repository: string = releaseRepository,
) {
  const deployments = z
    .array(z.unknown())
    .parse(
      await githubReleaseRequest(
        'deployments?environment=production&per_page=30',
        token,
        undefined,
        request,
        repository,
      ),
    )
  for (const input of deployments) {
    const deployment = publishedDeploymentSchema.safeParse(input)
    if (!deployment.success) continue
    const statuses = z
      .array(z.object({ state: z.string() }))
      .parse(
        await githubReleaseRequest(
          `deployments/${deployment.data.id}/statuses?per_page=1`,
          token,
          undefined,
          request,
          repository,
        ),
      )
    if (statuses[0]?.state === 'success') return deployment.data.payload
  }
  return undefined
}
