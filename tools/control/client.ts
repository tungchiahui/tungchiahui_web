import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { canonicalOperatorRequest } from '../../src/control-plane/auth'
import { createLocalOperatorHeaders } from '../dev/control-auth-fixture'

const oidcTokenResponseSchema = z.object({ value: z.string().min(1) }).passthrough()
const privateJwkSchema = z
  .object({
    crv: z.literal('Ed25519'),
    d: z.string().min(16),
    kty: z.literal('OKP'),
    x: z.string().min(16),
  })
  .strict()

function baseUrl() {
  return new URL(process.env.SITE_CONTROL_API_URL ?? 'https://www.tungchiahui.cn')
}

function boundHeaders(body: Uint8Array, purpose: string) {
  return {
    bodyHash: createHash('sha256').update(body).digest('hex'),
    nonce: `${purpose}-${randomUUID()}`,
    timestamp: Math.floor(Date.now() / 1_000),
  }
}

async function githubBearerToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!requestUrl || !requestToken) return null
  const url = new URL(requestUrl)
  url.searchParams.set('audience', 'tungchiahui-control-api')
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${requestToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`GitHub OIDC token request returned HTTP ${response.status}`)
  return oidcTokenResponseSchema.parse((await response.json()) as unknown).value
}

async function authenticationHeaders(
  method: string,
  path: string,
  body: Uint8Array,
  purpose: string,
) {
  const target = baseUrl()
  const bound = boundHeaders(body, purpose)
  const bearer = await githubBearerToken()
  if (bearer) {
    return Object.freeze({
      authorization: `Bearer ${bearer}`,
      'x-ops-body-sha256': bound.bodyHash,
      'x-ops-nonce': bound.nonce,
      'x-ops-timestamp': String(bound.timestamp),
    })
  }
  if (target.hostname === '127.0.0.1' || target.hostname === 'localhost') {
    return createLocalOperatorHeaders(method, path, body, {
      nonce: bound.nonce,
      timestamp: bound.timestamp,
    })
  }

  const keyId = z.string().min(1).parse(process.env.SITE_OPERATOR_KEY_ID)
  const keyPath = z.string().min(1).parse(process.env.SITE_OPERATOR_PRIVATE_KEY_PATH)
  const privateJwk = privateJwkSchema.parse(JSON.parse(readFileSync(keyPath, 'utf8')) as unknown)
  const canonical = canonicalOperatorRequest({
    bodyHash: bound.bodyHash,
    method,
    nonce: bound.nonce,
    path,
    timestamp: bound.timestamp,
  })
  const signature = sign(
    null,
    Buffer.from(canonical, 'utf8'),
    createPrivateKey({ format: 'jwk', key: privateJwk }),
  ).toString('base64url')
  return Object.freeze({
    authorization: `Signature ${keyId}`,
    'x-ops-body-sha256': bound.bodyHash,
    'x-ops-nonce': bound.nonce,
    'x-ops-signature': signature,
    'x-ops-timestamp': String(bound.timestamp),
  })
}

export async function controlRequest(
  path: string,
  options: Readonly<{
    body?: unknown
    idempotencyKey?: string
    method?: 'GET' | 'POST'
    purpose: string
  }>,
) {
  const method = options.method ?? 'GET'
  const body = Buffer.from(options.body === undefined ? '' : JSON.stringify(options.body))
  const headers = new Headers(await authenticationHeaders(method, path, body, options.purpose))
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey)
  const request: RequestInit = { headers, method, signal: AbortSignal.timeout(30_000) }
  if (body.length > 0) request.body = body
  const response = await fetch(new URL(path, baseUrl()), request)
  const text = await response.text()
  const payload = text.length === 0 ? null : (JSON.parse(text) as unknown)
  if (!response.ok) {
    const code = z.object({ error: z.string() }).safeParse(payload)
    throw new Error(
      `Control API returned HTTP ${response.status}: ${code.success ? code.data.error : 'invalid response'}`,
    )
  }
  return payload
}
