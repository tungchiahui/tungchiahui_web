import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountButton } from '@/components/account-button'
import { accountSessionResponseSchema } from '@/control-plane/account-contracts'

const labels = {
  login: 'Sign in',
  logout: 'Sign out',
  username: 'Username',
  password: 'Password',
  submit: 'Submit',
  cancel: 'Cancel',
  failed: 'Sign-in failed',
  logoutFailed: 'Sign-out failed',
}
const authenticated = { authenticated: true, account: { username: 'owner', role: 'owner' } }
const anonymous = { authenticated: false, account: null }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('account session UI', () => {
  it.each(['http', 'network', 'invalid-response', 'still-authenticated'] as const)(
    'keeps the session visible after a %s logout failure and allows retry',
    async (failure) => {
      let attempt = 0
      const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method !== 'DELETE') return Response.json(authenticated)
        attempt += 1
        if (attempt > 1) return Response.json(anonymous)
        if (failure === 'network') throw new Error('offline')
        if (failure === 'http') return Response.json({ error: 'unavailable' }, { status: 503 })
        return Response.json(failure === 'invalid-response' ? {} : authenticated)
      })
      vi.stubGlobal('fetch', fetcher)
      const listener = vi.fn()
      window.addEventListener('personal-auth-change', listener)
      try {
        render(<AccountButton labels={labels} />)
        await act(async () => {
          await Promise.resolve()
        })
        fireEvent.click(screen.getByRole('button', { name: 'owner' }))
        await act(async () => {
          await Promise.resolve()
        })
        expect(screen.getByRole('button', { name: 'owner' })).toBeEnabled()
        expect(screen.queryByRole('button', { name: labels.login })).not.toBeInTheDocument()
        expect(screen.getByRole('alert')).toHaveTextContent(labels.logoutFailed)
        expect(listener).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'owner' }))
        await act(async () => {
          await Promise.resolve()
        })
        expect(screen.getByRole('button', { name: labels.login })).toBeVisible()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(listener).toHaveBeenCalledOnce()
      } finally {
        window.removeEventListener('personal-auth-change', listener)
      }
    },
  )

  it('notifies same-tab listeners after successful logout when storage is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) =>
        Response.json(options?.method === 'DELETE' ? anonymous : authenticated),
      ),
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const listener = vi.fn()
    window.addEventListener('personal-auth-change', listener)
    try {
      render(<AccountButton labels={labels} />)
      await act(async () => {
        await Promise.resolve()
      })
      fireEvent.click(screen.getByRole('button', { name: 'owner' }))
      await act(async () => {
        await Promise.resolve()
      })
      expect(screen.getByRole('button', { name: labels.login })).toBeVisible()
      expect(listener).toHaveBeenCalledOnce()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      window.removeEventListener('personal-auth-change', listener)
    }
  })

  it('handles rejected session checks and login requests without unhandled rejections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    render(<AccountButton labels={labels} />)
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: labels.login }))
    fireEvent.change(screen.getByLabelText(labels.username), { target: { value: 'owner' } })
    fireEvent.change(screen.getByLabelText(labels.password), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: labels.submit }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(labels.failed)
    expect(screen.getByRole('button', { name: labels.submit })).toBeEnabled()
  })

  it('validates session state together with the public account identity', () => {
    expect(accountSessionResponseSchema.safeParse(authenticated).success).toBe(true)
    expect(accountSessionResponseSchema.safeParse(anonymous).success).toBe(true)
    expect(
      accountSessionResponseSchema.safeParse({ authenticated: true, account: null }).success,
    ).toBe(false)
    expect(
      accountSessionResponseSchema.safeParse({ ...anonymous, account: authenticated.account })
        .success,
    ).toBe(false)
  })
})
