import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  documentedLocalCredentials,
  type LocalInfrastructureInput,
  LocalInfrastructureValidationError,
  parseLocalInfrastructureConfig,
} from '../../tools/dev/config'

const controlRoot = resolve('/tmp/tungchiahui-config-test/control-state')

function validInput(): LocalInfrastructureInput {
  return {
    controlApiUrl: 'http://127.0.0.1:18080',
    controlStatePath: resolve(controlRoot, 'control.db'),
    databaseUrl: 'postgresql://tungchiahui:local-only-postgres@127.0.0.1:16432/tungchiahui',
    fakeDeployAgentUrl: 'http://127.0.0.1:18081',
    mode: 'local',
    s3AccessKeyId: documentedLocalCredentials.s3AccessKeyId,
    s3Bucket: 'tungchiahui-local-assets',
    s3Endpoint: 'http://127.0.0.1:19090',
    s3SecretAccessKey: documentedLocalCredentials.s3SecretAccessKey,
    siteBaseUrl: 'http://127.0.0.1:3000',
    translationProvider: 'fake',
  }
}

describe('local/test infrastructure boundary', () => {
  it('accepts only documented local targets and credentials', () => {
    const parsed = parseLocalInfrastructureConfig(validInput(), controlRoot)

    expect(parsed.mode).toBe('local')
    expect(parsed.databaseUrl.hostname).toBe('127.0.0.1')
    expect(parsed.translationProvider).toBe('fake')
  })

  it('rejects production hosts and bucket namespaces', () => {
    expect(() =>
      parseLocalInfrastructureConfig(
        {
          ...validInput(),
          databaseUrl:
            'postgresql://tungchiahui:local-only-postgres@ddns.tungchiahui.cn:5432/tungchiahui',
          s3Bucket: 'production-assets',
        },
        controlRoot,
      ),
    ).toThrow(LocalInfrastructureValidationError)
  })

  it('rejects credential overrides without echoing their value', () => {
    const productionLikeSecret = 'AKIA-NOT-A-LOCAL-CREDENTIAL'

    try {
      parseLocalInfrastructureConfig(
        { ...validInput(), s3SecretAccessKey: productionLikeSecret },
        controlRoot,
      )
      throw new Error('Expected credential validation to fail')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LocalInfrastructureValidationError)
      expect(error instanceof Error ? error.message : '').not.toContain(productionLikeSecret)
    }
  })

  it('rejects control-state paths outside the dedicated root', () => {
    expect(() =>
      parseLocalInfrastructureConfig(
        { ...validInput(), controlStatePath: '/var/lib/tungchiahui/control.db' },
        controlRoot,
      ),
    ).toThrow(LocalInfrastructureValidationError)
  })
})
