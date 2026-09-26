import { afterEach, describe, expect, it, vi } from 'vitest'

import { controlRequest } from '../../tools/control/client'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function useLocalControlApi() {
  vi.stubEnv('SITE_CONTROL_API_URL', 'http://127.0.0.1:8080')
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', '')
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', '')
}

describe('control client transient retry boundary', () => {
  it('retries a transient GET with a newly bound request', async () => {
    vi.useFakeTimers()
    useLocalControlApi()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(Response.json({ status: 'healthy' }))
    vi.stubGlobal('fetch', fetchMock)

    const request = controlRequest('/api/ops/status', { purpose: 'unit-status' })
    await vi.runAllTimersAsync()

    await expect(request).resolves.toEqual({ status: 'healthy' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
    expect(firstHeaders.get('x-ops-nonce')).not.toBe(secondHeaders.get('x-ops-nonce'))
  })

  it('does not retry authentication or policy denials', async () => {
    useLocalControlApi()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: 'github_oidc_policy_denied' }, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(controlRequest('/api/ops/status', { purpose: 'unit-denial' })).rejects.toThrow(
      'Control API returned HTTP 401: github_oidc_policy_denied',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-idempotent POST', async () => {
    useLocalControlApi()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      controlRequest('/api/ops/translations/example/cancel', {
        body: {},
        method: 'POST',
        purpose: 'unit-cancel',
      }),
    ).rejects.toThrow(
      'Control request POST /api/ops/translations/example/cancel failed after 1 attempt',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries an idempotent POST after a transport failure', async () => {
    vi.useFakeTimers()
    useLocalControlApi()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(Response.json({ operation: { id: 'operation-id' } }))
    vi.stubGlobal('fetch', fetchMock)

    const request = controlRequest('/api/ops/deployments', {
      body: { target: 'candidate' },
      idempotencyKey: 'unit-deployment-001',
      method: 'POST',
      purpose: 'unit-deployment',
    })
    await vi.runAllTimersAsync()

    await expect(request).resolves.toEqual({ operation: { id: 'operation-id' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries an EdgeOne origin TLS failure with the same deployment idempotency key', async () => {
    vi.useFakeTimers()
    useLocalControlApi()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 525 }))
      .mockResolvedValueOnce(Response.json({ operation: { id: 'operation-id' } }))
    vi.stubGlobal('fetch', fetchMock)

    const request = controlRequest('/api/ops/deployments', {
      body: { target: 'candidate' },
      idempotencyKey: 'unit-deployment-525',
      method: 'POST',
      purpose: 'unit-deployment',
    })
    await vi.runAllTimersAsync()

    await expect(request).resolves.toEqual({ operation: { id: 'operation-id' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
    expect(firstHeaders.get('idempotency-key')).toBe('unit-deployment-525')
    expect(secondHeaders.get('idempotency-key')).toBe('unit-deployment-525')
    expect(firstHeaders.get('x-ops-nonce')).not.toBe(secondHeaders.get('x-ops-nonce'))
  })
})
