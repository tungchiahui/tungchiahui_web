import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { build } from 'esbuild'
import { z } from 'zod'

const kindSchema = z.enum(['service', 'recovery', 'postgres'])
export type ComponentKind = z.infer<typeof kindSchema>
const dockerfiles = {
  service: 'ops/production/images/services.Dockerfile',
  recovery: 'ops/production/images/recovery.Dockerfile',
  postgres: 'ops/production/images/postgres.Dockerfile',
} as const

export async function componentSourcePaths(root: string, kind: ComponentKind) {
  if (kind === 'postgres') return [dockerfiles.postgres, '.github/workflows/release.yml']
  const dockerfile = readFileSync(resolve(root, dockerfiles[kind]), 'utf8')
  const entries = [...dockerfile.matchAll(/esbuild\s+((?:services|tools)\/[-a-z0-9/]+\.ts)/gu)].map(
    (match) => z.string().parse(match[1]),
  )
  if (entries.length === 0)
    throw new Error('Component Dockerfile has no reviewed build entrypoints')
  const bundle = await build({
    absWorkingDir: root,
    entryPoints: entries,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node24',
    outdir: 'dist',
    write: false,
    metafile: true,
    logLevel: 'silent',
  })
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'),
  )
  const inputs = Object.keys(bundle.metafile.inputs)
    .map((path) => relative(root, resolve(root, path)).replaceAll('\\', '/'))
    .filter((path) => tracked.has(path))
  return [
    ...new Set([
      ...inputs,
      '.npmrc',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      '.github/workflows/release.yml',
      dockerfiles[kind],
      'tools/ci/component-images.ts',
      ...(kind === 'service'
        ? ['drizzle', 'ops/database']
        : ['drizzle/migration-policy.json', 'drizzle/meta/_journal.json', 'ops/production']),
    ]),
  ].sort()
}

export function componentRevision(
  root: string,
  target: string,
  paths: readonly string[],
  installedSha?: string,
) {
  const shaSchema = z.string().regex(/^[a-f0-9]{40}$/u)
  shaSchema.parse(target)
  if (installedSha !== undefined) {
    shaSchema.parse(installedSha)
    try {
      execFileSync('git', ['diff', '--quiet', installedSha, target, '--', ...paths], {
        cwd: root,
        stdio: 'ignore',
      })
      return installedSha
    } catch {
      // Different inputs or unavailable history require the target's own component revision.
    }
  }
  return shaSchema.parse(
    execFileSync('git', ['log', '-1', '--format=%H', target, '--', ...paths], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
  )
}

export async function resolveComponentImage(
  kind: ComponentKind,
  target: string,
  reuse: boolean,
  installedSha?: string,
) {
  kindSchema.parse(kind)
  z.string()
    .regex(/^[a-f0-9]{40}$/u)
    .parse(target)
  const root = process.cwd()
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== target) throw new Error('Component checkout does not match the approved release')
  const sourceSha =
    kind === 'postgres' || reuse
      ? componentRevision(root, target, await componentSourcePaths(root, kind), installedSha)
      : target
  z.string()
    .regex(/^[a-f0-9]{40}$/u)
    .parse(sourceSha)
  const repository = `ghcr.io/tungchiahui/tungchiahui_web-${kind}`
  const reference = `${repository}:${sourceSha}`
  const inspection = spawnSync(
    'docker',
    ['buildx', 'imagetools', 'inspect', reference, '--format', '{{.Manifest.Digest}}'],
    { encoding: 'utf8' },
  )
  let digest = ''
  if (inspection.status === 0) {
    digest = z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/u)
      .parse(inspection.stdout.trim())
    execFileSync('docker', ['pull', `${repository}@${digest}`], { stdio: 'ignore' })
    const revision = execFileSync(
      'docker',
      [
        'image',
        'inspect',
        `${repository}@${digest}`,
        '--format',
        '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      ],
      { encoding: 'utf8' },
    ).trim()
    if (revision !== sourceSha)
      throw new Error('Published component has a different source revision')
  } else if (!/manifest unknown|not found/iu.test(inspection.stderr ?? '')) {
    throw new Error('Cannot safely determine whether the immutable component image exists')
  }
  return {
    source_sha: sourceSha,
    image_reference: reference,
    image_digest: digest,
    exists: digest !== '',
  }
}
