import { createHash } from 'node:crypto'

import { z } from 'zod'

import { retentionPolicy } from '../../src/maintenance/retention'

const releaseShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const packageVersionSchema = z
  .object({
    created_at: z.iso.datetime({ offset: true }),
    id: z.number().int().positive(),
    metadata: z.object({
      container: z.object({ tags: z.array(z.string()) }),
    }),
    name: z.string().min(1),
  })
  .passthrough()

export type GhcrPackageVersion = Readonly<z.infer<typeof packageVersionSchema>>

const packageNames = Object.freeze([
  'tungchiahui_web',
  'tungchiahui_web-postgres',
  'tungchiahui_web-recovery',
  'tungchiahui_web-service',
])

function planHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function planGhcrRetention(
  versionsByPackage: Readonly<Record<string, readonly GhcrPackageVersion[]>>,
  evaluatedAt = new Date(),
) {
  const cutoff = new Date(
    evaluatedAt.getTime() - retentionPolicy.ghcrMinimumAgeDays * 24 * 60 * 60 * 1_000,
  )
  const releaseCreated = new Map<string, number>()
  for (const versions of Object.values(versionsByPackage)) {
    for (const version of versions) {
      for (const tag of version.metadata.container.tags) {
        const releaseSha = releaseShaSchema.safeParse(tag)
        if (!releaseSha.success) continue
        releaseCreated.set(
          releaseSha.data,
          Math.max(
            releaseCreated.get(releaseSha.data) ?? 0,
            new Date(version.created_at).getTime(),
          ),
        )
      }
    }
  }
  const protectedReleaseShas = [...releaseCreated.entries()]
    .toSorted(
      ([shaA, createdA], [shaB, createdB]) => createdB - createdA || shaA.localeCompare(shaB),
    )
    .slice(0, retentionPolicy.ghcrReleaseCount)
    .map(([sha]) => sha)
    .toSorted()
  const protectedSet = new Set(protectedReleaseShas)
  const deletions = Object.entries(versionsByPackage)
    .flatMap(([packageName, versions]) =>
      versions.flatMap((version) => {
        const tags = version.metadata.container.tags.toSorted()
        if (tags.length !== 1) return []
        const releaseSha = releaseShaSchema.safeParse(tags[0])
        if (!releaseSha.success) return []
        if (protectedSet.has(releaseSha.data)) return []
        if (new Date(version.created_at).getTime() >= cutoff.getTime()) return []
        return [
          Object.freeze({
            createdAt: version.created_at,
            packageName,
            releaseSha: releaseSha.data,
            versionId: version.id,
          }),
        ]
      }),
    )
    .toSorted((a, b) => a.packageName.localeCompare(b.packageName) || a.versionId - b.versionId)
  const plan = Object.freeze({
    cutoff: cutoff.toISOString(),
    delete: Object.freeze(deletions),
    evaluatedAt: evaluatedAt.toISOString(),
    packages: packageNames,
    policy: Object.freeze({
      minimumAgeDays: retentionPolicy.ghcrMinimumAgeDays,
      releaseCount: retentionPolicy.ghcrReleaseCount,
    }),
    protectedReleaseShas: Object.freeze(protectedReleaseShas),
    version: 1 as const,
  })
  return Object.freeze({ ...plan, planSha256: planHash(plan) })
}

function githubHeaders(token: string) {
  return Object.freeze({
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2026-03-10',
  })
}

async function githubRequest(token: string, path: string, method: 'DELETE' | 'GET' = 'GET') {
  const response = await fetch(new URL(path, 'https://api.github.com'), {
    headers: githubHeaders(token),
    method,
    signal: AbortSignal.timeout(30_000),
  })
  if (method === 'DELETE' && (response.status === 204 || response.status === 404)) return null
  if (!response.ok) throw new Error(`GitHub Packages API returned HTTP ${String(response.status)}`)
  return (await response.json()) as unknown
}

async function listVersions(token: string, owner: string, packageName: string) {
  const versions: GhcrPackageVersion[] = []
  for (let page = 1; ; page += 1) {
    const result = z
      .array(packageVersionSchema)
      .parse(
        await githubRequest(
          token,
          `/users/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packageName)}/versions?per_page=100&page=${String(page)}`,
        ),
      )
    versions.push(...result)
    if (result.length < 100) return Object.freeze(versions)
  }
}

async function main() {
  const execute = process.argv.includes('--execute')
  const confirmationIndex = process.argv.indexOf('--confirm')
  const confirmation = confirmationIndex === -1 ? undefined : process.argv[confirmationIndex + 1]
  if (execute && confirmation !== 'GHCR-RETENTION-CLEANUP') {
    throw new Error('GHCR cleanup requires --confirm GHCR-RETENTION-CLEANUP')
  }
  const token = z.string().min(1).parse(process.env.GITHUB_TOKEN)
  const owner = z
    .string()
    .regex(/^[A-Za-z0-9-]+$/)
    .parse(process.env.GITHUB_REPOSITORY_OWNER)
  const entries = await Promise.all(
    packageNames.map(
      async (packageName) => [packageName, await listVersions(token, owner, packageName)] as const,
    ),
  )
  const plan = planGhcrRetention(Object.fromEntries(entries))
  if (execute) {
    for (const candidate of plan.delete) {
      await githubRequest(
        token,
        `/users/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(candidate.packageName)}/versions/${String(candidate.versionId)}`,
        'DELETE',
      )
    }
  }
  console.log(JSON.stringify({ executed: execute, plan }, null, 2))
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(
      summary,
      `### GHCR retention\n\n- Mode: ${execute ? 'execute' : 'dry-run'}\n- Plan: \`${plan.planSha256}\`\n- Versions selected: ${String(plan.delete.length)}\n`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
