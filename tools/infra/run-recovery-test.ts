import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'

const { values } = parseArgs({
  options: { 'source-postgres-image': { type: 'string' }, 'recovery-image': { type: 'string' } },
})
const sourceImage = z
  .string()
  .regex(/^ghcr\.io\/tungchiahui\/tungchiahui_web-postgres@sha256:[a-f0-9]{64}$/)
  .optional()
  .parse(values['source-postgres-image'])
const recoveryImage = z
  .string()
  .regex(/^ghcr\.io\/tungchiahui\/tungchiahui_web-recovery@sha256:[a-f0-9]{64}$/)
  .optional()
  .parse(values['recovery-image'])

function run(executable: string, arguments_: readonly string[]) {
  const result = spawnSync(executable, arguments_, { encoding: 'utf8', stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${executable} failed with exit code ${String(result.status)}`)
  }
}

const repositoryRoot = resolve(process.cwd())
const hostRoot = mkdtempSync(join(tmpdir(), 'tungchiahui-phase13-'))
chmodSync(hostRoot, 0o755)
const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const testImage = `tungchiahui-infra-test:${gitSha}`

try {
  run('docker', ['build', '--file', 'ops/production/tests/Dockerfile', '--tag', testImage, '.'])
  run('docker', [
    'run',
    '--rm',
    '--network',
    'host',
    '--entrypoint',
    'node',
    '--env',
    `PHASE13_GIT_SHA=${gitSha}`,
    '--env',
    `PHASE13_HOST_ROOT=${hostRoot}`,
    '--env',
    `PHASE13_REPOSITORY_ROOT=${repositoryRoot}`,
    ...(sourceImage ? ['--env', `PHASE13_SOURCE_POSTGRES_IMAGE=${sourceImage}`] : []),
    ...(recoveryImage ? ['--env', `PHASE13_RECOVERY_IMAGE=${recoveryImage}`] : []),
    '--mount',
    'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
    '--mount',
    `type=bind,source=${repositoryRoot},target=/workspace,readonly`,
    '--mount',
    `type=bind,source=${hostRoot},target=${hostRoot}`,
    '--workdir',
    '/workspace',
    testImage,
    '/recovery-runner.cjs',
  ])
} finally {
  spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--mount',
      `type=bind,source=${hostRoot},target=/target`,
      '--entrypoint',
      'chown',
      testImage,
      '-R',
      `${String(process.getuid?.() ?? 1000)}:${String(process.getgid?.() ?? 1000)}`,
      '/target',
    ],
    { stdio: 'ignore' },
  )
  rmSync(hostRoot, { force: true, maxRetries: 3, recursive: true })
}
