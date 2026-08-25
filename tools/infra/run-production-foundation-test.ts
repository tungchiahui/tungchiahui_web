import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function run(executable: string, arguments_: readonly string[]) {
  const result = spawnSync(executable, arguments_, { encoding: 'utf8', stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${executable} failed with exit code ${String(result.status)}`)
  }
}

async function freePort() {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen(0, '::', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        rejectPort(new Error('Unable to allocate an origin test port'))
        return
      }
      server.close((error) => (error ? rejectPort(error) : resolvePort(address.port)))
    })
  })
}

const repositoryRoot = resolve(process.cwd())
const hostRoot = mkdtempSync(join(tmpdir(), 'tungchiahui-phase12-'))
chmodSync(hostRoot, 0o755)
const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const originPort = await freePort()
const registryPort = await freePort()
const testImage = `tungchiahui-infra-test:${gitSha}`

try {
  run('docker', ['build', '--file', 'ops/production/tests/Dockerfile', '--tag', testImage, '.'])
  run('docker', [
    'run',
    '--rm',
    '--network',
    'host',
    '--env',
    `PHASE12_GIT_SHA=${gitSha}`,
    '--env',
    `PHASE12_HOST_ROOT=${hostRoot}`,
    '--env',
    `PHASE12_HOST_UID=${String(process.getuid?.() ?? 1000)}`,
    '--env',
    `PHASE12_HOST_GID=${String(process.getgid?.() ?? 1000)}`,
    '--env',
    `PHASE12_ORIGIN_PORT=${String(originPort)}`,
    '--env',
    `PHASE15_REGISTRY_PORT=${String(registryPort)}`,
    '--mount',
    'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
    '--mount',
    `type=bind,source=${repositoryRoot},target=/workspace,readonly`,
    '--mount',
    `type=bind,source=${hostRoot},target=${hostRoot}`,
    '--workdir',
    '/workspace',
    testImage,
  ])
} finally {
  try {
    rmSync(hostRoot, { force: true, maxRetries: 3, recursive: true })
  } catch {
    const hostIdentity = `${String(process.getuid?.() ?? 1000)}:${String(process.getgid?.() ?? 1000)}`
    run('docker', [
      'run',
      '--rm',
      '--entrypoint',
      'chown',
      '--mount',
      `type=bind,source=${hostRoot},target=${hostRoot}`,
      testImage,
      '--recursive',
      hostIdentity,
      hostRoot,
    ])
    rmSync(hostRoot, { force: true, maxRetries: 3, recursive: true })
  }
}
