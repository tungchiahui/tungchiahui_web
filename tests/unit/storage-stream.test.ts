import { describe, expect, it, vi } from 'vitest'

import { streamWithCleanup } from '@/storage/stream'

describe('storage response stream cleanup', () => {
  it('keeps the upstream alive until the response body is consumed', async () => {
    const cleanup = vi.fn()
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('monitoring'))
        controller.close()
      },
    })

    const response = new Response(streamWithCleanup(source, cleanup))
    expect(cleanup).not.toHaveBeenCalled()
    expect(await response.text()).toBe('monitoring')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('cancels the upstream and cleans up after a disconnected consumer', async () => {
    const cleanup = vi.fn()
    const cancel = vi.fn()
    const source = new ReadableStream<Uint8Array>({ cancel })
    const stream = streamWithCleanup(source, cleanup)

    await stream.cancel('client_disconnected')

    expect(cancel).toHaveBeenCalledWith('client_disconnected')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('cleans up exactly once when the upstream fails', async () => {
    const cleanup = vi.fn()
    const failure = new Error('upstream_failed')
    const source = new ReadableStream<Uint8Array>({
      pull() {
        throw failure
      },
    })
    const reader = streamWithCleanup(source, cleanup).getReader()

    await expect(reader.read()).rejects.toBe(failure)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
