import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDatabaseClient } from '../../src/database/client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('database client failure boundary', () => {
  it('keeps the process alive and emits safe telemetry for an idle backend error', async () => {
    const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const client = createDatabaseClient({
      applicationName: 'control-api',
      connectionString: 'postgresql://local:local@127.0.0.1:5432/test',
      maxConnections: 1,
    })

    expect(() =>
      client.pool.emit('error', new Error('idle backend connection closed')),
    ).not.toThrow()
    expect(JSON.parse(String(errorOutput.mock.calls[0]?.[0]))).toMatchObject({
      attributes: {
        application_name: 'control-api',
        error_type: 'Error',
        message: 'idle backend connection closed',
      },
      component: 'postgresql',
      event: 'idle_client_error',
      level: 'error',
    })

    await client.close()
  })
})
