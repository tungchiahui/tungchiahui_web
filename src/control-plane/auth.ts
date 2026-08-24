import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto'

import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
  type KeyInput,
} from 'jose'
import { z } from 'zod'

import {
  type ActorIdentity,
  actorIdentitySchema,
  type Capability,
  capabilitySchema,
} from './contracts'

const base64UrlSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .min(16)
  .max(1_024)
const nonceSchema = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[A-Za-z0-9._~-]+$/)
const timestampSchema = z.coerce.number().int().nonnegative()
const bodyHashSchema = z.string().regex(/^[a-f0-9]{64}$/)

const signedRequestHeadersSchema = z
  .object({
    authorization: z.string().min(1),
    'x-ops-body-sha256': bodyHashSchema,
    'x-ops-nonce': nonceSchema,
    'x-ops-timestamp': timestampSchema,
  })
  .strict()

const operatorAuthorizationSchema = z.string().regex(/^Signature [A-Za-z0-9._-]{1,100}$/)
const bearerAuthorizationSchema = z.string().regex(/^Bearer [A-Za-z0-9._~-]+$/)

const operatorKeySchema = z
  .object({
    actorId: z.string().min(1).max(200),
    capabilities: z.array(capabilitySchema).min(1),
    keyId: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
    publicKeyJwk: z
      .object({
        crv: z.literal('Ed25519'),
        kty: z.literal('OKP'),
        x: base64UrlSchema,
      })
      .strict(),
  })
  .strict()

const githubOidcPolicySchema = z
  .object({
    audience: z.string().min(1),
    capabilities: z.array(capabilitySchema).min(1),
    environment: z.string().min(1),
    issuer: z.url(),
    jwksUrl: z.url(),
    ref: z.string().min(1),
    repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    workflowRef: z.string().min(1),
  })
  .strict()

const githubClaimsSchema = z
  .object({
    aud: z.union([z.string(), z.array(z.string()).min(1)]),
    environment: z.string().min(1),
    exp: z.number().int(),
    iat: z.number().int(),
    iss: z.url(),
    job_workflow_ref: z.string().min(1),
    nbf: z.number().int().optional(),
    ref: z.string().min(1),
    repository: z.string().min(1),
    sub: z.string().min(1),
  })
  .passthrough()

export type OperatorKey = Readonly<z.infer<typeof operatorKeySchema>>
export type GitHubOidcPolicy = Readonly<z.infer<typeof githubOidcPolicySchema>>

export type ReplayNonce = Readonly<{
  actorId: string
  bodyHash: string
  expiresAt: string
  nonce: string
}>

export type ReplayStore = Readonly<{
  consumeNonce: (nonce: ReplayNonce) => boolean
}>

export type AuthenticationInput = Readonly<{
  body: Uint8Array
  headers: Headers
  method: string
  now: Date
  path: string
}>

export type AuthenticationConfiguration = Readonly<{
  github: GitHubOidcPolicy
  githubVerificationKey?: JWTVerifyGetKey | KeyInput
  operatorKeys: readonly OperatorKey[]
  replayWindowSeconds: number
}>

export class AuthenticationError extends Error {
  override readonly name = 'AuthenticationError'
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export class AuthorizationError extends Error {
  override readonly name = 'AuthorizationError'
  readonly capability: Capability

  constructor(capability: Capability) {
    super(`Actor does not have required capability: ${capability}`)
    this.capability = capability
  }
}

function headerRecord(headers: Headers) {
  return {
    authorization: headers.get('authorization'),
    'x-ops-body-sha256': headers.get('x-ops-body-sha256'),
    'x-ops-nonce': headers.get('x-ops-nonce'),
    'x-ops-timestamp': headers.get('x-ops-timestamp'),
  }
}

function parseBoundHeaders(input: AuthenticationInput, replayWindowSeconds: number) {
  const parsed = signedRequestHeadersSchema.safeParse(headerRecord(input.headers))
  if (!parsed.success) {
    throw new AuthenticationError('malformed_auth_headers', 'Authentication headers are invalid')
  }

  const expectedBodyHash = sha256(input.body)
  const received = Buffer.from(parsed.data['x-ops-body-sha256'], 'utf8')
  const expected = Buffer.from(expectedBodyHash, 'utf8')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AuthenticationError('body_hash_mismatch', 'Request body hash does not match')
  }

  const requestTime = parsed.data['x-ops-timestamp']
  const nowSeconds = Math.floor(input.now.getTime() / 1_000)
  if (Math.abs(nowSeconds - requestTime) > replayWindowSeconds) {
    throw new AuthenticationError('timestamp_outside_window', 'Request timestamp is outside window')
  }

  return Object.freeze({
    authorization: parsed.data.authorization,
    bodyHash: expectedBodyHash,
    nonce: parsed.data['x-ops-nonce'],
    timestamp: requestTime,
  })
}

function consumeReplayNonce(
  store: ReplayStore,
  actorId: string,
  bodyHash: string,
  nonce: string,
  timestamp: number,
  replayWindowSeconds: number,
) {
  const consumed = store.consumeNonce({
    actorId,
    bodyHash,
    expiresAt: new Date((timestamp + replayWindowSeconds) * 1_000).toISOString(),
    nonce,
  })
  if (!consumed) {
    throw new AuthenticationError('replay_detected', 'Request nonce was already used')
  }
}

export function sha256(body: Uint8Array) {
  return createHash('sha256').update(body).digest('hex')
}

export function canonicalOperatorRequest(input: {
  bodyHash: string
  method: string
  nonce: string
  path: string
  timestamp: number
}) {
  return [
    input.method.toUpperCase(),
    input.path,
    bodyHashSchema.parse(input.bodyHash),
    String(timestampSchema.parse(input.timestamp)),
    nonceSchema.parse(input.nonce),
  ].join('\n')
}

function authenticateOperator(
  input: AuthenticationInput,
  bound: ReturnType<typeof parseBoundHeaders>,
  configuration: AuthenticationConfiguration,
  replayStore: ReplayStore,
) {
  const authorization = operatorAuthorizationSchema.safeParse(bound.authorization)
  const signature = input.headers.get('x-ops-signature')
  const parsedSignature = base64UrlSchema.safeParse(signature)
  if (!authorization.success || !parsedSignature.success) {
    throw new AuthenticationError('malformed_operator_signature', 'Operator signature is invalid')
  }

  const keyId = authorization.data.slice('Signature '.length)
  const key = configuration.operatorKeys.find((candidate) => candidate.keyId === keyId)
  if (!key) {
    throw new AuthenticationError('unknown_operator_key', 'Operator key is not authorized')
  }

  const canonical = canonicalOperatorRequest({
    bodyHash: bound.bodyHash,
    method: input.method,
    nonce: bound.nonce,
    path: input.path,
    timestamp: bound.timestamp,
  })
  const publicKey = createPublicKey({ format: 'jwk', key: key.publicKeyJwk })
  const valid = verify(
    null,
    Buffer.from(canonical, 'utf8'),
    publicKey,
    Buffer.from(parsedSignature.data, 'base64url'),
  )
  if (!valid) {
    throw new AuthenticationError('invalid_operator_signature', 'Operator signature is invalid')
  }

  consumeReplayNonce(
    replayStore,
    key.actorId,
    bound.bodyHash,
    bound.nonce,
    bound.timestamp,
    configuration.replayWindowSeconds,
  )

  return actorIdentitySchema.parse({
    capabilities: key.capabilities,
    id: key.actorId,
    kind: 'operator',
  })
}

export async function validateGitHubOidcToken(
  token: string,
  policyInput: unknown,
  verificationKey?: JWTVerifyGetKey | KeyInput,
) {
  const policy = githubOidcPolicySchema.parse(policyInput)
  const key = verificationKey ?? createRemoteJWKSet(new URL(policy.jwksUrl))
  let payload: JWTPayload
  try {
    const verified = await jwtVerify(token, key, {
      audience: policy.audience,
      issuer: policy.issuer,
    })
    payload = verified.payload
  } catch {
    throw new AuthenticationError('invalid_github_oidc_token', 'GitHub OIDC token is invalid')
  }

  const claims = githubClaimsSchema.safeParse(payload)
  if (!claims.success) {
    throw new AuthenticationError('invalid_github_oidc_claims', 'GitHub OIDC claims are invalid')
  }

  if (
    claims.data.iss !== policy.issuer ||
    claims.data.repository !== policy.repository ||
    claims.data.ref !== policy.ref ||
    claims.data.environment !== policy.environment ||
    claims.data.job_workflow_ref !== policy.workflowRef
  ) {
    throw new AuthenticationError('github_oidc_policy_denied', 'GitHub OIDC claims are not allowed')
  }

  return actorIdentitySchema.parse({
    capabilities: policy.capabilities,
    id: `github:${claims.data.repository}:${claims.data.job_workflow_ref}`,
    kind: 'github-actions',
  })
}

async function authenticateGitHub(
  bound: ReturnType<typeof parseBoundHeaders>,
  configuration: AuthenticationConfiguration,
  replayStore: ReplayStore,
) {
  const authorization = bearerAuthorizationSchema.safeParse(bound.authorization)
  if (!authorization.success) {
    throw new AuthenticationError('malformed_bearer_token', 'Bearer token is invalid')
  }
  const token = authorization.data.slice('Bearer '.length)
  const actor = await validateGitHubOidcToken(
    token,
    configuration.github,
    configuration.githubVerificationKey,
  )
  consumeReplayNonce(
    replayStore,
    actor.id,
    bound.bodyHash,
    bound.nonce,
    bound.timestamp,
    configuration.replayWindowSeconds,
  )
  return actor
}

export async function authenticateControlRequest(
  input: AuthenticationInput,
  configurationInput: AuthenticationConfiguration,
  replayStore: ReplayStore,
): Promise<ActorIdentity> {
  const configuration = Object.freeze({
    ...configurationInput,
    github: githubOidcPolicySchema.parse(configurationInput.github),
    operatorKeys: configurationInput.operatorKeys.map((key) => operatorKeySchema.parse(key)),
    replayWindowSeconds: z
      .number()
      .int()
      .min(30)
      .max(900)
      .parse(configurationInput.replayWindowSeconds),
  })
  const bound = parseBoundHeaders(input, configuration.replayWindowSeconds)
  if (bound.authorization.startsWith('Signature ')) {
    return authenticateOperator(input, bound, configuration, replayStore)
  }
  if (bound.authorization.startsWith('Bearer ')) {
    return authenticateGitHub(bound, configuration, replayStore)
  }
  throw new AuthenticationError('unsupported_authentication', 'Authentication scheme is invalid')
}

export function requireCapability(actor: ActorIdentity, capabilityInput: Capability) {
  const capability = capabilitySchema.parse(capabilityInput)
  if (!actor.capabilities.includes(capability)) {
    throw new AuthorizationError(capability)
  }
}

export function parseOperatorKeys(input: unknown) {
  return z.array(operatorKeySchema).min(1).parse(input)
}

export function parseGitHubOidcPolicy(input: unknown) {
  return githubOidcPolicySchema.parse(input)
}
