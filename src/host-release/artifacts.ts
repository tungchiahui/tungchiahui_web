import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { requestDockerJson } from '../deployment/docker-platform'
import { type HostRelease, type HostSettings, hostReleaseSchema, topologyFiles } from './contracts'
import { runHostCommand, writeHostFile } from './provision'

const imageSchema = z
  .array(
    z.object({
      Id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      RepoDigests: z.array(z.string()).nullable(),
      Config: z.object({ Labels: z.record(z.string(), z.string()).nullable() }),
    }),
  )
  .length(1)

export async function pullHostImage(
  repository: string,
  digest: string,
  environment: Readonly<Record<string, string>>,
) {
  const reference = `${repository}@${digest}`
  const authentication = Buffer.from(
    JSON.stringify({
      serveraddress: repository.split('/')[0],
      username: environment.DEPLOYMENT_REGISTRY_USERNAME,
      password: environment.DEPLOYMENT_REGISTRY_TOKEN,
    }),
  ).toString('base64url')
  const result = await requestDockerJson(
    '/var/run/docker.sock',
    'POST',
    `/images/create?fromImage=${encodeURIComponent(reference)}`,
    undefined,
    { 'x-registry-auth': authentication },
    // Registry authentication/manifest resolution can be quiet before pull progress starts.
    // Keep ordinary Docker/health calls at 30 seconds; bound each artifact pull separately.
    { inactivityTimeoutMilliseconds: 120_000, deadlineMilliseconds: 600_000 },
  )
  if (result.status !== 200) throw new Error('Registry rejected an immutable release image')
  const events =
    typeof result.body === 'string'
      ? result.body
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as unknown)
      : [result.body]
  for (const event of events) {
    const parsed = z
      .object({ error: z.unknown().optional(), errorDetail: z.unknown().optional() })
      .parse(event)
    if (parsed.error !== undefined || parsed.errorDetail !== undefined)
      throw new Error('Immutable release image pull failed')
  }
  return reference
}

export function inspectReleaseImage(reference: string, sha: string) {
  const image = imageSchema.parse(
    JSON.parse(runHostCommand('docker', ['image', 'inspect', reference]).stdout) as unknown,
  )[0]
  if (!image || image.Config.Labels?.['org.opencontainers.image.revision'] !== sha)
    throw new Error('Immutable image revision does not match the authorized SHA')
  if (reference.includes('@') && !image.RepoDigests?.includes(reference))
    throw new Error('Immutable image digest does not match the approved repository')
  return image
}

async function ensureHostReleaseImage(
  repository: string,
  digest: string,
  sha: string,
  environment: Readonly<Record<string, string>>,
) {
  const reference = `${repository}@${digest}`
  try {
    return inspectReleaseImage(reference, sha)
  } catch {
    await pullHostImage(repository, digest, environment)
    return inspectReleaseImage(reference, sha)
  }
}

export async function resolveHostRelease(
  repository: string,
  sha: string,
  webDigest: string,
  environment: Readonly<Record<string, string>>,
) {
  const image = await ensureHostReleaseImage(repository, webDigest, sha, environment)
  const release = hostReleaseSchema.parse({
    sha,
    webDigest,
    serviceDigest: image.Config.Labels?.['cn.tungchiahui.release.service-digest'],
    recoveryDigest: image.Config.Labels?.['cn.tungchiahui.release.recovery-digest'],
  })
  for (const [suffix, digest] of [
    ['service', release.serviceDigest],
    ['recovery', release.recoveryDigest],
  ] as const) {
    await ensureHostReleaseImage(`${repository}-${suffix}`, digest, sha, environment)
  }
  return release
}

export function hostGenerationDirectory(settings: HostSettings, sha: string) {
  return join(
    settings.configRoot,
    'host-runtime/generations',
    z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .parse(sha),
  )
}

const hostArtifacts = [
  ['/app/host/node', 'node', true],
  ['/app/host/host-coordinator.cjs', 'host-coordinator.cjs', false],
  ['/app/host/release-supervisor.cjs', 'release-supervisor.cjs', false],
  ...topologyFiles.map(
    (file) => [`/app/host/ops/production/${file}`, `ops/production/${file}`, false] as const,
  ),
  ['/app/host/ops/production/active-slot.conf', 'ops/production/active-slot.conf', false],
] as const
const markerSchema = z
  .object({
    release: hostReleaseSchema,
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict()

export function extractHostGeneration(
  settings: HostSettings,
  repository: string,
  release: HostRelease,
) {
  const directory = hostGenerationDirectory(settings, release.sha)
  mkdirSync(join(directory, 'ops/production'), { recursive: true, mode: 0o700 })
  const markerPath = join(directory, 'complete.json')
  if (existsSync(markerPath)) {
    if (!lstatSync(markerPath).isFile() || lstatSync(markerPath).isSymbolicLink())
      throw new Error('Host artifact marker must be a regular file')
    try {
      const marker = markerSchema.parse(JSON.parse(readFileSync(markerPath, 'utf8')) as unknown)
      if (
        JSON.stringify(marker.release) === JSON.stringify(release) &&
        hostArtifacts.every(([, destination, executable]) => {
          const path = join(directory, destination)
          if (!existsSync(path)) return false
          const metadata = lstatSync(path)
          return (
            metadata.isFile() &&
            !metadata.isSymbolicLink() &&
            metadata.uid === 0 &&
            (metadata.mode & 0o777) === (executable ? 0o700 : 0o600) &&
            createHash('sha256').update(readFileSync(path)).digest('hex') ===
              marker.files[destination]
          )
        })
      )
        return directory
    } catch {
      /* An incomplete/crashed copy is repaired from the same approved immutable image. */
    }
  }
  const container = `tungchiahui-artifact-${randomUUID()}`
  const temporary = join(directory, `.artifact-${randomUUID()}`)
  mkdirSync(temporary, { mode: 0o700 })
  runHostCommand('docker', [
    'create',
    '--name',
    container,
    `${repository}-recovery@${release.recoveryDigest}`,
  ])
  try {
    const files: Record<string, string> = {}
    for (const [source, destination, executable] of hostArtifacts) {
      const staged = join(temporary, 'file')
      runHostCommand('docker', ['cp', `${container}:${source}`, staged])
      if (!lstatSync(staged).isFile() || lstatSync(staged).isSymbolicLink())
        throw new Error('Host artifact must be a regular file')
      const bytes = readFileSync(staged)
      if (bytes.byteLength === 0) throw new Error('Host artifact is empty')
      // Atomic replacement preserves an executing Node inode during repeated activation.
      writeHostFile(join(directory, destination), bytes, 0, 0, executable ? 0o700 : 0o600)
      files[destination] = createHash('sha256').update(bytes).digest('hex')
      rmSync(staged)
    }
    writeHostFile(markerPath, JSON.stringify({ release, files }), 0, 0, 0o600)
    for (const path of [
      join(directory, 'ops'),
      directory,
      join(settings.configRoot, 'host-runtime/generations'),
      join(settings.configRoot, 'host-runtime'),
      settings.configRoot,
    ]) {
      const fd = openSync(path, 'r')
      try {
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    }
  } finally {
    runHostCommand('docker', ['rm', container], {}, true)
    rmSync(temporary, { recursive: true, force: true })
  }
  return directory
}
