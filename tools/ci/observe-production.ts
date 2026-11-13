import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import {
  publicReleaseReceiptSchema,
  publishedDeploymentSchema,
} from '../../src/host-release/publication-contracts'
import { githubReleaseRequest } from './github-publications'

async function main() {
  const token = z.string().min(1).parse(process.env.GITHUB_TOKEN)
  const deployments = z
    .array(z.unknown())
    .parse(await githubReleaseRequest('deployments?environment=production&per_page=20', token))
  const candidates = deployments
    .map((d) => publishedDeploymentSchema.safeParse(d))
    .filter((d) => d.success)
    .map((d) => d.data)
  const receiptSchema = z.object({
    current: publicReleaseReceiptSchema.nullable(),
    state: z.enum(['completed', 'pending', 'failed', 'cancelled']),
  })
  const deadline = Date.now() + 10 * 60 * 1000
  const pending = new Set<number>()
  for (const deployment of candidates) {
    const statuses = z
      .array(z.object({ state: z.string() }))
      .parse(await githubReleaseRequest(`deployments/${deployment.id}/statuses?per_page=1`, token))
    if (statuses[0]?.state === 'pending' || statuses[0]?.state === 'in_progress')
      pending.add(deployment.id)
  }
  // Reconcile the active receipt even after a manual rollback or an earlier status timeout.
  let currentReceipt: z.infer<typeof receiptSchema> | undefined
  try {
    const response = await fetch('https://www.tungchiahui.cn/api/ops/releases/status', {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (response.ok) currentReceipt = receiptSchema.parse(await response.json())
  } catch {
    console.log('Current production receipt temporarily unavailable')
  }
  const active = candidates.find(
    (deployment) =>
      currentReceipt?.current?.gitSha === deployment.payload.gitSha &&
      currentReceipt.current.imageDigest === deployment.payload.imageDigest &&
      currentReceipt.current.serviceSha === deployment.payload.serviceSha &&
      currentReceipt.current.recoverySha === deployment.payload.recoverySha,
  )
  if (active) {
    const statuses = z
      .array(z.object({ state: z.string() }))
      .parse(await githubReleaseRequest(`deployments/${active.id}/statuses?per_page=1`, token))
    if (statuses[0]?.state !== 'success')
      await githubReleaseRequest(`deployments/${active.id}/statuses`, token, {
        state: 'success',
        description: 'Current server convergence receipt verified',
        environment_url: 'https://www.tungchiahui.cn',
        auto_inactive: true,
      })
    pending.delete(active.id)
  }
  let failed = false
  do {
    for (const deployment of candidates.filter((d) => pending.has(d.id))) {
      if (Date.now() > deadline) break
      let receipt: z.infer<typeof receiptSchema>
      try {
        const url = new URL('https://www.tungchiahui.cn/api/ops/releases/status')
        url.searchParams.set('sha', deployment.payload.gitSha)
        url.searchParams.set('digest', deployment.payload.imageDigest)
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error('Receipt temporarily unavailable')
        receipt = receiptSchema.parse(await response.json())
      } catch {
        console.log(JSON.stringify({ publicationId: deployment.id, state: 'receipt-unavailable' }))
        continue
      }
      if (receipt.state === 'pending') continue
      const success =
        receipt.state === 'completed' &&
        receipt.current?.gitSha === deployment.payload.gitSha &&
        receipt.current.imageDigest === deployment.payload.imageDigest &&
        receipt.current.serviceSha === deployment.payload.serviceSha &&
        receipt.current.recoverySha === deployment.payload.recoverySha
      await githubReleaseRequest(`deployments/${deployment.id}/statuses`, token, {
        state: success ? 'success' : 'failure',
        description: success
          ? 'Server convergence and deployment receipt verified'
          : 'Server deployment failed; inspect authenticated operations status',
        environment_url: 'https://www.tungchiahui.cn',
        auto_inactive: success,
      })
      pending.delete(deployment.id)
      failed ||= !success
      console.log(
        JSON.stringify({ publicationId: deployment.id, state: success ? 'deployed' : 'failed' }),
      )
    }
    if (pending.size > 0 && Date.now() < deadline) await delay(15000)
  } while (pending.size > 0 && Date.now() < deadline)
  if (pending.size > 0)
    console.log(`::warning::${pending.size} publication(s) await a later production receipt check`)
  if (failed) process.exitCode = 1
}
void main().catch(() => {
  console.error('Production receipt reconciliation failed')
  process.exitCode = 1
})
