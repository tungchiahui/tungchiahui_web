'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { OwnerDatasetKey } from '@/domain/persistence'
import {
  type DatasetSnapshot,
  datasetResponseSchema,
  sessionStatusSchema,
} from '@/personal/contracts'

function fetchTracker(url: string, options: RequestInit = {}) {
  return fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
}

export type SaveState =
  | 'saved'
  | 'pending'
  | 'saving'
  | 'error'
  | 'conflict'
  | 'invalid'
  | 'expired'

export function useOwnerDataset<T>(
  key: OwnerDatasetKey,
  schema: z.ZodType<T>,
  initial: DatasetSnapshot<T>,
) {
  const [payload, setPayload] = useState(initial.payload)
  const [authenticated, setAuthenticated] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [checking, setChecking] = useState(true)
  const [state, setState] = useState<SaveState>('saved')
  const [draftAvailable, setDraftAvailable] = useState(false)
  const current = useRef(initial)
  const latest = useRef(initial.payload)
  const dirty = useRef(false)
  const sending = useRef(false)
  const owner = useRef(false)
  const sessionRequest = useRef(0)
  const draftKey = `personal-draft-v1:${key}`

  const saveDraft = useCallback(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ payload: latest.current, revision: current.current.revision }),
      )
    } catch {
      /* Export remains available when browser storage is full/disabled. */
    }
  }, [draftKey])

  const checkSession = useCallback(async () => {
    const request = ++sessionRequest.current
    try {
      const response = await fetchTracker('/api/ops/owner/session', { cache: 'no-store' })
      if (!response.ok) throw new Error('session_unavailable')
      const session = sessionStatusSchema.parse(await response.json())
      if (request !== sessionRequest.current) return
      owner.current = session.authenticated
      setAuthenticated(session.authenticated)
      setEnabled(session.enabled !== false)
      if (!session.authenticated && dirty.current) setState('expired')
    } catch {
      if (request !== sessionRequest.current) return
      owner.current = false
      setAuthenticated(false)
      if (dirty.current) setState('expired')
    } finally {
      if (request === sessionRequest.current) setChecking(false)
    }
  }, [])

  const reload = useCallback(
    async (discardDraft = false) => {
      const startingPayload = latest.current
      const response = await fetchTracker(`/api/personal-data/${key}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('dataset_unavailable')
      const data = datasetResponseSchema(schema).parse(await response.json()).dataset
      if (!data) throw new Error('dataset_missing')
      // A focus refresh must not replace edits made while its request was in flight.
      if (latest.current !== startingPayload || sending.current) return
      current.current = data
      latest.current = data.payload
      dirty.current = false
      setPayload(data.payload)
      setState('saved')
      if (discardDraft) {
        try {
          sessionStorage.removeItem(draftKey)
        } catch {
          /* Optional browser draft. */
        }
        setDraftAvailable(false)
      }
    },
    [key, schema, draftKey],
  )

  useEffect(() => {
    void checkSession()
    try {
      setDraftAvailable(Boolean(sessionStorage.getItem(draftKey)))
    } catch {
      /* Optional browser draft. */
    }
    const focus = () => {
      void checkSession()
      if (!dirty.current && !sending.current) void reload().catch(() => setState('error'))
    }
    const storage = (event: StorageEvent) => {
      if (event.key === 'personal-auth-change') void checkSession()
    }
    window.addEventListener('focus', focus)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener('focus', focus)
      window.removeEventListener('storage', storage)
    }
  }, [checkSession, draftKey, reload])

  const change = useCallback(
    (value: T) => {
      if (!owner.current) return
      latest.current = value
      dirty.current = true
      setPayload(value)
      saveDraft()
      setState((previous) =>
        previous === 'conflict' || previous === 'expired' || previous === 'saving'
          ? previous
          : 'pending',
      )
    },
    [saveDraft],
  )

  const save = useCallback(async () => {
    if (!owner.current || sending.current || !dirty.current) return
    const parsed = schema.safeParse(latest.current)
    if (!parsed.success) {
      setState('invalid')
      return
    }
    const sent = latest.current
    sending.current = true
    setState('saving')
    try {
      const response = await fetchTracker(`/api/ops/owner/datasets/${key}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: parsed.data, expectedRevision: current.current.revision }),
      })
      if (response.status === 401) {
        owner.current = false
        setAuthenticated(false)
        setState('expired')
        return
      }
      if (response.status === 409) {
        setState('conflict')
        return
      }
      if (!response.ok) throw new Error('save_failed')
      const saved = datasetResponseSchema(schema).parse(await response.json()).dataset
      if (!saved) throw new Error('save_failed')
      current.current = saved
      if (latest.current === sent) {
        dirty.current = false
        setState('saved')
        try {
          sessionStorage.removeItem(draftKey)
        } catch {
          /* Optional browser draft. */
        }
        setDraftAvailable(false)
      } else {
        saveDraft()
        setState('pending')
      }
    } catch {
      setState('error')
      saveDraft()
    } finally {
      sending.current = false
    }
  }, [draftKey, key, saveDraft, schema])

  useEffect(() => {
    if (state !== 'pending' || !authenticated || payload !== latest.current) return
    const timer = setTimeout(() => {
      void save()
    }, 900)
    return () => clearTimeout(timer)
  }, [payload, state, authenticated, save])

  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        saveDraft()
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', leaving)
    return () => window.removeEventListener('beforeunload', leaving)
  }, [saveDraft])

  const signalAuthChange = () => {
    try {
      localStorage.setItem('personal-auth-change', crypto.randomUUID())
    } catch {
      /* Focus also rechecks server authentication. */
    }
  }
  const login = async (password: string) => {
    const response = await fetchTracker('/api/ops/owner/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) throw new Error(response.status === 429 ? 'limited' : 'loginFailed')
    sessionStatusSchema.parse(await response.json())
    await checkSession()
    if (!dirty.current) await reload()
    // Existing unsaved data is never uploaded merely by logging in again.
    signalAuthChange()
  }
  const logout = async () => {
    const response = await fetchTracker('/api/ops/owner/session', { method: 'DELETE' })
    if (!response.ok) throw new Error('logoutFailed')
    sessionRequest.current += 1
    owner.current = false
    setAuthenticated(false)
    if (dirty.current) {
      saveDraft()
      setState('expired')
    }
    signalAuthChange()
  }
  const restoreDraft = () => {
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null')
      const draft = z
        .object({ payload: schema, revision: z.number().int().nonnegative() })
        .parse(raw)
      change(draft.payload)
      if (draft.revision !== current.current.revision) setState('conflict')
      setDraftAvailable(false)
    } catch {
      setState('invalid')
    }
  }
  return {
    payload,
    authenticated,
    enabled,
    checking,
    state,
    change,
    save,
    login,
    logout,
    reload,
    draftAvailable,
    restoreDraft,
  }
}
