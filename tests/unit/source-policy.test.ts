import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { analyzeSourceFiles } from '../../tools/quality/source-policy-lib'

const repositoryRoot = resolve('/virtual/repository')

function virtualFiles(entries: Readonly<Record<string, string>>) {
  return new Map(
    Object.entries(entries).map(([path, source]) => [resolve(repositoryRoot, path), source]),
  )
}

describe('source policy', () => {
  it('rejects direct and transitive server imports from a client boundary', () => {
    const violations = analyzeSourceFiles(
      repositoryRoot,
      virtualFiles({
        'src/components/client.tsx':
          "'use client'\nimport {bridge} from '@/lib/bridge'\nvoid bridge",
        'src/lib/bridge.ts': "export {secret} from '@/server/secret'",
        'src/server/secret.ts': "import 'server-only'\nexport const secret = 'sealed'",
      }),
    )

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'src/components/client.tsx',
        rule: 'server-client-boundary',
      }),
    ])
  })

  it('allows a client boundary to import shared modules', () => {
    const violations = analyzeSourceFiles(
      repositoryRoot,
      virtualFiles({
        'src/components/client.tsx':
          "'use client'\nimport {shared} from '@/lib/shared'\nvoid shared",
        'src/lib/shared.ts': "export const shared = 'safe'",
      }),
    )

    expect(violations).toEqual([])
  })

  it('rejects JavaScript application files and explicit any', () => {
    const violations = analyzeSourceFiles(
      repositoryRoot,
      virtualFiles({
        'src/legacy.js': 'export const legacy = true',
        'src/unsafe.ts': 'export type Unsafe = any',
      }),
    )

    expect(violations.map((violation) => violation.rule).sort()).toEqual([
      'application-javascript',
      'unrecorded-any',
    ])
  })

  it('rejects privileged control routes inside the Next.js application', () => {
    const violations = analyzeSourceFiles(
      repositoryRoot,
      virtualFiles({
        'src/app/api/ops/status/route.ts': 'export const GET = () => Response.json({})',
      }),
    )

    expect(violations).toEqual([
      expect.objectContaining({
        file: 'src/app/api/ops/status/route.ts',
        rule: 'nextjs-ops-route',
      }),
    ])
  })
})
