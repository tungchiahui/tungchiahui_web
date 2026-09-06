import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parse } from 'yaml'
import { z } from 'zod'

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name)
    return statSync(path).isDirectory() ? walkFiles(path) : [path]
  })
}

const lock = z
  .object({
    packages: z.record(z.string(), z.unknown()),
  })
  .passthrough()
  .parse(parse(readFileSync(resolve('pnpm-lock.yaml'), 'utf8')) as unknown)

const productionSources = [
  'ops/production/compose.yaml',
  'ops/production/openresty.conf',
  ...walkFiles(resolve('ops/production/images')),
  ...walkFiles(resolve('ops/production/ansible')),
]
const forbiddenProductionPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bage-secret-key-[A-Za-z0-9-]{20,}/iu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/iu,
] as const

for (const path of productionSources) {
  const source = readFileSync(path, 'utf8')
  for (const pattern of forbiddenProductionPatterns) {
    if (pattern.test(source)) throw new Error(`Production config secret scan failed: ${path}`)
  }
}

const clientBundleFiles = walkFiles(resolve('.next/static'))
const forbiddenClientValues = [
  'postgresql://',
  'DATABASE_URL',
  'SITE_REVALIDATION_SECRET',
  'ASSET_S3_SECRET_ACCESS_KEY',
  'CONTROL_OPERATOR_KEYS_JSON',
  'DEPLOYMENT_REGISTRY_TOKEN',
] as const
for (const path of clientBundleFiles) {
  const source = readFileSync(path, 'utf8')
  for (const value of forbiddenClientValues) {
    if (source.includes(value)) throw new Error(`Client bundle leaks server-only marker ${value}`)
  }
}

const dockerfiles = walkFiles(resolve('ops/production/images')).filter((path) =>
  path.endsWith('.Dockerfile'),
)
for (const path of dockerfiles) {
  const fromLines = readFileSync(path, 'utf8').match(/^FROM .*$/gmu) ?? []
  for (const line of fromLines) {
    if (
      !line.includes('@sha256:') &&
      !/^FROM (?:build|dependencies|node-build|node-dependencies|pgbackrest-build)\b/u.test(line)
    ) {
      throw new Error(`Unpinned production image source: ${line}`)
    }
  }
}

console.log(
  JSON.stringify({
    clientBundleFiles: clientBundleFiles.length,
    imageDefinitions: dockerfiles.length,
    lockfileSbomPackages: Object.keys(lock.packages).length,
    productionConfigFiles: productionSources.length,
    status: 'pass',
  }),
)
