import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const repository = 'ghcr.io/tungchiahui/tungchiahui_web-pgbouncer'
const sourceSha = execFileSync(
  'git',
  ['log', '-1', '--format=%H', '--', 'ops/production/images/pgbouncer.Dockerfile'],
  { encoding: 'utf8' },
).trim()
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Missing PgBouncer recipe commit')
const reference = `${repository}:${sourceSha}`
const inspection = spawnSync(
  'docker',
  ['buildx', 'imagetools', 'inspect', reference, '--format', '{{.Manifest.Digest}}'],
  { encoding: 'utf8' },
)
let digest = ''
if (inspection.status === 0) {
  digest = inspection.stdout.trim()
  if (!/^sha256:[a-f0-9]{64}$/.test(digest))
    throw new Error('Registry returned an invalid image digest')
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
    throw new Error('Existing PgBouncer image has a different source revision')
} else if (!/manifest unknown|not found/i.test(inspection.stderr ?? '')) {
  throw new Error('Cannot safely determine whether the immutable PgBouncer image already exists')
}
const output = process.env.GITHUB_OUTPUT
if (!output) throw new Error('GitHub Actions output file is required')
appendFileSync(
  output,
  `source_sha=${sourceSha}\nimage_reference=${reference}\nimage_digest=${digest}\nexists=${digest !== ''}\n`,
)
