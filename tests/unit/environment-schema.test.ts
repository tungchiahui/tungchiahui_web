import { describe, expect, it } from 'vitest'

import { EnvironmentValidationError, parseEnvironment } from '@/config/environment-schema'

describe('parseEnvironment', () => {
  it('uses safe local defaults outside production', () => {
    const environment = parseEnvironment({ NODE_ENV: 'test' })

    expect(environment.nodeEnvironment).toBe('test')
    expect(environment.siteBaseUrl.href).toBe('http://localhost:3000/')
  })

  it('requires an explicit production base URL', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow(EnvironmentValidationError)
  })

  it('does not expose invalid input values in validation errors', () => {
    const sensitiveValue = 'not-a-url-with-sensitive-material'

    expect(() => parseEnvironment({ SITE_BASE_URL: sensitiveValue })).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(sensitiveValue) }),
    )
  })
})
