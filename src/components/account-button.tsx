'use client'

import { Dialog } from '@base-ui/react/dialog'
import { LogIn, LogOut, UserCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

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
  }
}) {
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const notify = () => {
    window.localStorage.setItem('personal-auth-change', crypto.randomUUID())
    window.dispatchEvent(new Event('personal-auth-change'))
  }
  useEffect(() => {
    void fetch('/api/ops/auth/session', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return
      const data = (await response.json()) as {
        authenticated?: boolean
        account?: { username?: string }
      }
      if (data.authenticated) setAccount(data.account?.username ?? null)
    })
  }, [])
  const logout = async () => {
    await fetch('/api/ops/auth/session', { method: 'DELETE' })
    setAccount(null)
    notify()
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {account ? (
        <Button aria-label={account} className="rounded-full" onClick={() => void logout()}>
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
              setError('')
              const response = await fetch('/api/ops/auth/session', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ username, password }),
              })
              if (!response.ok) {
                setError(labels.failed)
                return
              }
              const data = (await response.json()) as { account?: { username?: string } }
              setAccount(data.account?.username ?? username)
              setOpen(false)
              setUsername('')
              setPassword('')
              notify()
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
              <Button type="submit">{labels.submit}</Button>
              <Dialog.Close render={<Button type="button" />}>{labels.cancel}</Dialog.Close>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
