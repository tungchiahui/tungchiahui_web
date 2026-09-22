import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { analyzeWorkflowPolicies } from '../../tools/ci/workflow-policy'

const serviceDigestReference =
  'SITE_SERVICE_IMAGE_DIGEST=$' + '{{ needs.build-service.outputs.image_digest }}'

describe('Phase 15 workflow trigger and credential separation', () => {
  it('keeps Quality, Application, Content and Translation automation hard-gated and separate', () => {
    expect(analyzeWorkflowPolicies(resolve(process.cwd()))).toEqual([])
  })

  it.each([
    {
      expected: 'Deploy job must remain build-gated, production-scoped and OIDC-only',
      replacement: 'environment: staging',
      target: 'environment: production',
    },
    {
      expected: 'Missing or invalid release job: release-result',
      replacement: '  disabled-release-result:',
      target: '  release-result:',
    },
    {
      expected: `Missing policy: ${serviceDigestReference}`,
      replacement: 'SITE_SERVICE_IMAGE_DIGEST=sha256:unbound',
      target: serviceDigestReference,
    },
  ])('rejects a structurally unsafe release workflow mutation: $target', (scenario) => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-policy-'))
    try {
      cpSync(resolve('.github'), join(root, '.github'), { recursive: true })
      const releasePath = join(root, '.github', 'workflows', 'release.yml')
      const source = readFileSync(releasePath, 'utf8')
      expect(source).toContain(scenario.target)
      writeFileSync(releasePath, source.replace(scenario.target, scenario.replacement))
      expect(analyzeWorkflowPolicies(root)).toContainEqual({
        file: 'release.yml',
        message: scenario.expected,
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
