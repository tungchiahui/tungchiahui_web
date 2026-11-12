'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { accountSessionResponseSchema } from '@/control-plane/account-contracts'
import { type HealthSnapshot, healthSnapshotSchema } from '@/health/contracts'

export async function healthRequest(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/ops/health/${path}`, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'failed')
  return response.json() as Promise<unknown>
}
export function useHealthData() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  const reload = useCallback(async (clear = false) => {
    const current = ++generation.current
    if (clear) setSnapshot(null)
    try {
      const response = await fetch('/api/ops/auth/session', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('failed')
      const session = accountSessionResponseSchema.parse(await response.json())
      if (current !== generation.current) return
      if (!session.authenticated || session.account.role !== 'owner') {
        setSnapshot(null)
        return
      }
      const data = healthSnapshotSchema.parse(await healthRequest('snapshot'))
      if (current === generation.current) {
        setSnapshot(data)
        setError(false)
      }
    } catch {
      if (current === generation.current) {
        setSnapshot(null)
        setError(true)
      }
    } finally {
      if (current === generation.current) setChecking(false)
    }
  }, [])
  useEffect(() => {
    // Retire the old browser draft containing private measurements.
    try {
      sessionStorage.removeItem('personal-draft-v1:weight_loss')
    } catch {
      /* Storage is optional. */
    }
    void reload()
    const auth = () => {
      void reload(true)
    }
    const focus = () => {
      void reload()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === 'personal-auth-change') auth()
    }
    window.addEventListener('personal-auth-change', auth)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', focus)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, 60000)
    return () => {
      generation.current++
      clearInterval(timer)
      window.removeEventListener('personal-auth-change', auth)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', focus)
    }
  }, [reload])
  return { snapshot, checking, error, reload }
}
