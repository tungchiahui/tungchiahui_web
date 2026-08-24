import { createHash, createPrivateKey, sign } from 'node:crypto'

import { canonicalOperatorRequest } from '../../src/control-plane/auth'

// Fixed public test material: this key is intentionally non-secret and must never authorize production.
const localTestPrivateJwk = Object.freeze({
  crv: 'Ed25519' as const,
  d: 'F2N7454Y0Zv11xtDBfzt3iG4bf0d9KpOxRi1nQs1nPI',
  kty: 'OKP' as const,
  x: 'uJHy1WFXYWvg7oHPHG-_UBg_krmBWEc4vN3DlUNr_NA',
})

export function createLocalOperatorHeaders(
  method: string,
  path: string,
  body: Uint8Array,
  options: { nonce?: string; timestamp?: number } = {},
) {
  const bodyHash = createHash('sha256').update(body).digest('hex')
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1_000)
  const nonce = options.nonce ?? `local-${crypto.randomUUID()}`
  const canonical = canonicalOperatorRequest({ bodyHash, method, nonce, path, timestamp })
  const privateKey = createPrivateKey({ format: 'jwk', key: localTestPrivateJwk })
  const signature = sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url')

  return Object.freeze({
    authorization: 'Signature local-phase4-operator',
    'x-ops-body-sha256': bodyHash,
    'x-ops-nonce': nonce,
    'x-ops-signature': signature,
    'x-ops-timestamp': String(timestamp),
  })
}
