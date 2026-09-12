import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { useOwnerDataset } from '../../src/components/personal/use-owner-dataset'

const schema = z.object({ note: z.string() })
const initial = { payload: { note: 'published' }, revision: 0 }
afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
  localStorage.clear()
})

describe('owner dataset browser lifecycle', () => {
  it('preserves edits made while a public refresh is in flight', async () => {
    let deliver: (value: Response) => void = () => {
      throw new Error('No request')
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/session')
          ? Promise.resolve(Response.json({ authenticated: true, enabled: true }))
          : new Promise<Response>((resolve) => {
              deliver = resolve
            }),
      ),
    )
    const { result, unmount } = renderHook(() => useOwnerDataset('tech_footprint', schema, initial))
    await waitFor(() => expect(result.current.authenticated).toBe(true))
    let refresh: Promise<void> = Promise.resolve()
    act(() => {
      refresh = result.current.reload()
    })
    act(() => result.current.change({ note: 'new draft' }))
    await act(async () => {
      deliver(Response.json({ dataset: { payload: { note: 'old response' }, revision: 1 } }))
      await refresh
    })
    expect(result.current.payload.note).toBe('new draft')
    expect(sessionStorage.getItem('personal-draft-v1:tech_footprint')).toContain('new draft')
    unmount()
  })
  it('retains a stored draft through automatic refresh and never uploads it on login', async () => {
    sessionStorage.setItem(
      'personal-draft-v1:tech_footprint',
      JSON.stringify({ payload: { note: 'unsaved' }, revision: 0 }),
    )
    const fetcher = vi.fn((url: string) =>
      Promise.resolve(
        Response.json(
          url.includes('/session') ? { authenticated: true, enabled: true } : { dataset: initial },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetcher)
    const { result, unmount } = renderHook(() => useOwnerDataset('tech_footprint', schema, initial))
    await waitFor(() => expect(result.current.authenticated).toBe(true))
    await act(() => result.current.reload())
    await act(() => result.current.login('test-password'))
    expect(result.current.payload.note).toBe('published')
    expect(result.current.draftAvailable).toBe(true)
    expect(sessionStorage.getItem('personal-draft-v1:tech_footprint')).toContain('unsaved')
    expect(fetcher.mock.calls.every(([url]) => !url.includes('/datasets/'))).toBe(true)
    unmount()
  })
  it('keeps edits after network failure and retries against the same revision', async () => {
    let fails = true
    const fetcher = vi.fn((url: string) => {
      if (url.includes('/session')) return Promise.resolve(Response.json({ authenticated: true }))
      if (fails) return Promise.reject(new Error('offline'))
      return Promise.resolve(
        Response.json({ dataset: { payload: { note: 'draft' }, revision: 1 } }),
      )
    })
    vi.stubGlobal('fetch', fetcher)
    const { result, unmount } = renderHook(() => useOwnerDataset('tech_footprint', schema, initial))
    await waitFor(() => expect(result.current.authenticated).toBe(true))
    act(() => result.current.change({ note: 'draft' }))
    await act(() => result.current.save())
    expect(result.current.state).toBe('error')
    expect(result.current.payload.note).toBe('draft')
    fails = false
    await act(() => result.current.save())
    expect(result.current.state).toBe('saved')
    expect(sessionStorage.getItem('personal-draft-v1:tech_footprint')).toBeNull()
    unmount()
  })
})
