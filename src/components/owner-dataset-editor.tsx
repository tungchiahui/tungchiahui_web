'use client'

import { KeyRound, Save, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { z } from 'zod'

const privateJwkSchema = z
  .object({
    crv: z.literal('Ed25519'),
    d: z.string().min(1),
    kty: z.literal('OKP'),
    x: z.string().min(1),
  })
  .passthrough()

export function OwnerDatasetEditor({
  datasetKey,
  payload,
  revision,
}: Readonly<{
  datasetKey: 'tech_footprint' | 'weight_loss'
  payload: unknown
  revision: number
}>) {
  const t = useTranslations('Web.datasets')
  const [json, setJson] = useState(() => JSON.stringify(payload, null, 2))
  const [keyId, setKeyId] = useState('production-owner-v1')
  const [privateJwk, setPrivateJwk] = useState<JsonWebKey | null>(null)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const keyInput = useRef<HTMLInputElement>(null)

  async function loadKey(file: File | undefined) {
    if (!file) return
    try {
      setPrivateJwk(privateJwkSchema.parse(JSON.parse(await file.text()) as unknown))
      setFeedback(t('keyReady'))
    } catch {
      setPrivateJwk(null)
      setFeedback(t('invalidKey'))
    }
  }

  async function save() {
    if (!privateJwk) {
      setFeedback(t('chooseKeyFirst'))
      return
    }
    setSaving(true)
    try {
      const parsedPayload = JSON.parse(json) as unknown
      const path = `/api/ops/datasets/${datasetKey}`
      const body = JSON.stringify({ expectedRevision: revision, payload: parsedPayload })
      const bodyHash = await sha256Hex(body)
      const timestamp = Math.floor(Date.now() / 1_000)
      const nonce = crypto.randomUUID()
      const canonical = `PUT\n${path}\n${bodyHash}\n${timestamp}\n${nonce}`
      const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'Ed25519' }, false, [
        'sign',
      ])
      const signature = base64Url(
        await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(canonical)),
      )
      const response = await fetch(path, {
        body,
        headers: {
          authorization: `Signature ${keyId}`,
          'content-type': 'application/json',
          'x-ops-body-sha256': bodyHash,
          'x-ops-nonce': nonce,
          'x-ops-signature': signature,
          'x-ops-timestamp': String(timestamp),
        },
        method: 'PUT',
      })
      if (!response.ok) throw new Error(`Dataset update failed: ${response.status}`)
      setFeedback(t('saved'))
      window.location.reload()
    } catch {
      setFeedback(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="dataset-panel owner-editor">
      <summary>
        <KeyRound size={18} />
        <strong>{t('ownerEditor')}</strong>
        <span>{t('ownerOnly')}</span>
      </summary>
      <div>
        <p>{t('ownerEditorDescription')}</p>
        <label>
          <span>{t('keyId')}</span>
          <input onChange={(event) => setKeyId(event.currentTarget.value)} value={keyId} />
        </label>
        <button
          className="legacy-secondary-link"
          onClick={() => keyInput.current?.click()}
          type="button"
        >
          <Upload size={16} />
          {privateJwk ? t('keyReady') : t('choosePrivateKey')}
        </button>
        <input
          accept="application/json"
          className="sr-only"
          onChange={(event) => void loadKey(event.target.files?.[0])}
          ref={keyInput}
          type="file"
        />
        <label>
          <span>{t('datasetJson')}</span>
          <textarea
            onChange={(event) => setJson(event.currentTarget.value)}
            rows={14}
            spellCheck={false}
            value={json}
          />
        </label>
        <button
          className="legacy-primary-link"
          disabled={saving}
          onClick={() => void save()}
          type="button"
        >
          <Save size={16} />
          {saving ? t('saving') : t('save')}
        </button>
        {feedback ? <p aria-live="polite">{feedback}</p> : null}
      </div>
    </details>
  )
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function base64Url(value: ArrayBuffer) {
  let binary = ''
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
