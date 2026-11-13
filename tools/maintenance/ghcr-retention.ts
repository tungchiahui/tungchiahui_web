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
  protectedComponents: readonly string[] = [],
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
        // PostgreSQL is host-pinned independently of Web releases. Its recovery images are
        // retired during explicit database maintenance, outside generic Web retention.
        if (packageName === 'tungchiahui_web-postgres') return []
        if (protectedComponents.includes(`${packageName}@${version.name}`)) return []
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
      postgresMaintenanceOnly: true,
    }),
    protectedReleaseShas: Object.freeze(protectedReleaseShas),
    protectedComponents: Object.freeze([...protectedComponents].toSorted()),
    version: 1 as const,
  })
  return Object.freeze({ ...plan, planSha256: planHash(plan) })
}

export function manifestComponentReferences(labels: unknown) {
  const parsed = z.record(z.string(), z.string()).parse(labels ?? {})
  return (['service', 'recovery'] as const).flatMap((kind) => {
    const value = parsed[`cn.tungchiahui.release.${kind}-digest`]
    if (value === undefined) return []
    const digest = z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/u)
      .parse(value)
    return [`tungchiahui_web-${kind}@${digest}`]
  })
}

export async function retainedComponentReferences(
  token: string,
  owner: string,
  webVersions: readonly GhcrPackageVersion[],
) {
  const repository = `${owner}/tungchiahui_web`
  const registryTokenResponse = await fetch(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${process.env.GITHUB_ACTOR ?? owner}:${token}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (!registryTokenResponse.ok) throw new Error('Cannot authenticate the retained manifest reader')
  const registryToken = z
    .object({ token: z.string().min(1) })
    .parse(await registryTokenResponse.json()).token
  const read = async (path: string) => {
    const response = await fetch(`https://ghcr.io/v2/${repository}/${path}`, {
      headers: {
        authorization: `Bearer ${registryToken}`,
        accept:
          'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error('Cannot verify retained image dependencies; cleanup refused')
    return (await response.json()) as unknown
  }
  const manifestSchema = z.object({
    config: z.object({ digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u) }).optional(),
    manifests: z
      .array(
        z.object({
          digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
          platform: z.object({ architecture: z.string(), os: z.string() }),
        }),
      )
      .optional(),
  })
  const protectedReferences = new Set<string>()
  for (const version of webVersions) {
    const digest = z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/u)
      .parse(version.name)
    let manifest = manifestSchema.parse(await read(`manifests/${digest}`))
    if (manifest.manifests !== undefined) {
      const linux = manifest.manifests.find(
        (entry) => entry.platform.os === 'linux' && entry.platform.architecture === 'amd64',
      )
      if (!linux) throw new Error('Retained release has no supported platform manifest')
      manifest = manifestSchema.parse(await read(`manifests/${linux.digest}`))
    }
    if (!manifest.config) throw new Error('Retained release has no image config')
    const configuration = z
      .object({
        config: z.object({ Labels: z.record(z.string(), z.string()).nullable().optional() }),
      })
      .parse(await read(`blobs/${manifest.config.digest}`))
    for (const reference of manifestComponentReferences(configuration.config.Labels))
      protectedReferences.add(reference)
  }
  return [...protectedReferences].toSorted()
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
  const versions = Object.fromEntries(entries)
  const evaluatedAt = new Date()
  const initialPlan = planGhcrRetention(versions, evaluatedAt)
  const removedWebIds = new Set(
    initialPlan.delete
      .filter((entry) => entry.packageName === 'tungchiahui_web')
      .map((entry) => entry.versionId),
  )
  const retainedWeb = (versions.tungchiahui_web ?? []).filter(
    (version) =>
      !removedWebIds.has(version.id) &&
      version.metadata.container.tags.some((tag) => releaseShaSchema.safeParse(tag).success),
  )
  const references =
    retainedWeb.length === 0 ? [] : await retainedComponentReferences(token, owner, retainedWeb)
  const plan = planGhcrRetention(versions, evaluatedAt, references)
  console.log(
    JSON.stringify({
      event: 'ghcr_retention_plan',
      planSha256: plan.planSha256,
      delete: plan.delete,
    }),
  )
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
  await main().catch(() => {
    console.error('GHCR retention did not complete; review the last verified plan')
    process.exitCode = 1
  })
}
