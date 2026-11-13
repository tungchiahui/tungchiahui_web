import { appendFileSync } from 'node:fs'
import { z } from 'zod'
import { type ComponentKind, resolveComponentImage } from './component-images'
import { confirmedPublication } from './github-publications'

const statusSchema = z.object({
  hostExecutor: z.object({
    installed: z.boolean(),
    healthy: z.boolean(),
    currentSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .nullable(),
    sourceSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .nullable()
      .optional(),
    serviceSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .nullable()
      .optional(),
    pendingSha: z.string().nullable(),
  }),
})

export function supportsComponentReuse(statusInput: unknown, recoveryDockerfile: string) {
  const status = statusSchema.parse(statusInput)
  return (
    status.hostExecutor.installed &&
    status.hostExecutor.healthy &&
    status.hostExecutor.currentSha !== null &&
    status.hostExecutor.pendingSha === null &&
    /cn\.tungchiahui\.host-release-manifest-versions="[^"]*\b2\b[^"]*"/u.test(recoveryDockerfile)
  )
}

async function main() {
  let reuse = false
  const installedSources: Partial<Record<ComponentKind, string>> = {}
  if (process.env.DEPLOYMENT_ENABLED === 'true') {
    try {
      const publication = await confirmedPublication(
        z.string().min(1).parse(process.env.GITHUB_TOKEN),
      )
      if (publication) {
        reuse = true
        installedSources.service = publication.serviceSha
        installedSources.recovery = publication.recoverySha
      }
    } catch {
      // A legacy/unavailable control plane still permits building a same-SHA recovery release.
      console.log(
        JSON.stringify({
          event: 'component_plan',
          reuse: false,
          reason: 'compatibility-unconfirmed',
        }),
      )
    }
  }
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error('GitHub Actions output file is required')
  const target = z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .parse(process.env.RELEASE_SHA)
  const components = await Promise.all(
    (['service', 'recovery', 'postgres'] as const).map(
      async (kind) =>
        [kind, await resolveComponentImage(kind, target, reuse, installedSources[kind])] as const,
    ),
  )
  const lines = components.flatMap(([kind, result]) =>
    Object.entries(result).map(([key, value]) => `${kind}_${key}=${String(value)}`),
  )
  appendFileSync(output, [`reuse_components=${reuse}`, ...lines, ''].join('\n'))
  console.log(JSON.stringify({ event: 'component_plan', reuse }))
}

if (process.argv[1]?.endsWith('/plan-components.ts'))
  void main().catch(() => {
    console.error('Immutable component planning failed')
    process.exitCode = 1
  })
