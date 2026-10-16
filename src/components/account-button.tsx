'use client'

import { Dialog } from '@base-ui/react/dialog'
import { LogIn, LogOut, UserCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { accountSessionResponseSchema } from '@/control-plane/account-contracts'

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function AccountButton({
  labels,
}: {
  labels: {
    login: string
    logout: string
    username: string
    password: string
    submit: string
    cancel: string
    failed: string
    logoutFailed: string
  }
}) {
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [pending, setPending] = useState(false)
  const notify = () => {
    try {
      window.localStorage.setItem('personal-auth-change', crypto.randomUUID())
    } catch {
      // Same-tab listeners must still update when browser storage is unavailable.
    }
    window.dispatchEvent(new Event('personal-auth-change'))
  }
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/ops/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const data = accountSessionResponseSchema.parse(await response.json())
        if (!controller.signal.aborted && data.authenticated) setAccount(data.account.username)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  const logout = async () => {
    setPending(true)
    setLogoutError('')
    try {
      const response = await fetch('/api/ops/auth/session', { method: 'DELETE' })
      if (!response.ok) throw new Error('logout_failed')
      const data = accountSessionResponseSchema.parse(await response.json())
      if (data.authenticated) throw new Error('session_not_revoked')
      setAccount(null)
      notify()
    } catch {
      setLogoutError(labels.logoutFailed)
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="relative">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        {account ? (
          <Button
            aria-label={account}
            className="rounded-full"
            disabled={pending}
            onClick={() => void logout()}
            title={labels.logout}
          >
            <UserCircle className="mr-2 size-4" />
            {account}
            <LogOut className="ml-2 size-4" />
          </Button>
        ) : (
          <Dialog.Trigger render={<Button aria-label={labels.login} className="rounded-full" />}>
            <LogIn className="mr-2 size-4" />
            {labels.login}
          </Dialog.Trigger>
        )}
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 shadow-xl">
            <Dialog.Title className="font-semibold text-xl">{labels.login}</Dialog.Title>
            <form
              className="mt-5 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault()
                setPending(true)
                setError('')
                try {
                  const response = await fetch('/api/ops/auth/session', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                  })
                  if (!response.ok) throw new Error('login_failed')
                  const data = accountSessionResponseSchema.parse(await response.json())
                  if (!data.authenticated) throw new Error('session_not_created')
                  setAccount(data.account.username)
                  setOpen(false)
                  setUsername('')
                  setPassword('')
                  notify()
                } catch {
                  setError(labels.failed)
                } finally {
                  setPending(false)
                }
              }}
            >
              <label className="block space-y-2">
                <span>{labels.username}</span>
                <input
                  className={fieldClass}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span>{labels.password}</span>
                <input
                  className={fieldClass}
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="text-red-600">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button disabled={pending} type="submit">
                  {labels.submit}
                </Button>
                <Dialog.Close render={<Button type="button" />}>{labels.cancel}</Dialog.Close>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      {logoutError ? (
        <p
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border bg-background p-3 text-red-600 text-sm shadow-lg"
          role="alert"
        >
          {logoutError}
        </p>
      ) : null}
    </div>
  )
}
