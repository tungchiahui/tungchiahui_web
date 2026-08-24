import { generateKeyPairSync, sign } from 'node:crypto'

import { generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import {
  AuthenticationError,
  AuthorizationError,
  authenticateControlRequest,
  canonicalOperatorRequest,
  parseGitHubOidcPolicy,
  parseOperatorKeys,
  requireCapability,
  sha256,
  validateGitHubOidcToken,
} from '../../src/control-plane/auth'
import type { ActorIdentity } from '../../src/control-plane/contracts'

function operatorFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const [key] = parseOperatorKeys([
    {
      actorId: 'operator:test',
      capabilities: ['status:read'],
      keyId: 'test-key',
      publicKeyJwk: publicKey.export({ format: 'jwk' }),
    },
  ])
  if (!key) throw new Error('Operator fixture key was not created')
  const seen = new Set<string>()
  const configuration = {
    github: parseGitHubOidcPolicy({
      audience: 'control-api',
      capabilities: ['application-job:create'],
      environment: 'production',
      issuer: 'https://token.actions.githubusercontent.com',
      jwksUrl: 'https://token.actions.githubusercontent.com/.well-known/jwks',
      ref: 'refs/heads/main',
      repository: 'owner/repository',
      workflowRef: 'owner/repository/.github/workflows/deploy.yml@refs/heads/main',
    }),
    operatorKeys: [key],
    replayWindowSeconds: 300,
  }

  function request(
    options: {
      body?: string
      nonce?: string
      now?: Date
      signatureBodyHash?: string
      timestamp?: number
    } = {},
  ) {
    const body = Buffer.from(options.body ?? '')
    const now = options.now ?? new Date('2026-08-24T12:00:00.000Z')
    const timestamp =
      options.timestamp ?? Math.floor(new Date('2026-08-24T12:00:00.000Z').getTime() / 1_000)
    const nonce = options.nonce ?? 'test-nonce-00000001'
    const bodyHash = options.signatureBodyHash ?? sha256(body)
    const canonical = canonicalOperatorRequest({
      bodyHash,
      method: 'GET',
      nonce,
      path: '/api/ops/status',
      timestamp,
    })
    const signature = sign(null, Buffer.from(canonical), privateKey).toString('base64url')
    const headers = new Headers({
      authorization: 'Signature test-key',
      'x-ops-body-sha256': bodyHash,
      'x-ops-nonce': nonce,
      'x-ops-signature': signature,
      'x-ops-timestamp': String(timestamp),
    })
    return {
      configuration,
      input: { body, headers, method: 'GET', now, path: '/api/ops/status' },
      replayStore: {
        consumeNonce: ({ actorId, nonce: requestNonce }: { actorId: string; nonce: string }) => {
          const identity = `${actorId}:${requestNonce}`
          if (seen.has(identity)) return false
          seen.add(identity)
          return true
        },
      },
    }
  }

  return { request }
}

describe('control-plane authentication and authorization', () => {
  it('binds an operator signature to method, path, body hash, timestamp and nonce', async () => {
    const fixture = operatorFixture()
    const valid = fixture.request()
    await expect(
      authenticateControlRequest(valid.input, valid.configuration, valid.replayStore),
    ).resolves.toEqual({
      capabilities: ['status:read'],
      id: 'operator:test',
      kind: 'operator',
    })

    const replay = fixture.request()
    await expect(
      authenticateControlRequest(replay.input, replay.configuration, replay.replayStore),
    ).rejects.toMatchObject({ code: 'replay_detected' })

    const tampered = fixture.request({ body: 'changed', nonce: 'test-nonce-00000002' })
    tampered.input.headers.set('x-ops-body-sha256', sha256(Buffer.from('other')))
    await expect(
      authenticateControlRequest(tampered.input, tampered.configuration, tampered.replayStore),
    ).rejects.toMatchObject({ code: 'body_hash_mismatch' })

    const expired = fixture.request({
      nonce: 'test-nonce-00000003',
      now: new Date('2026-08-24T13:00:00.000Z'),
    })
    await expect(
      authenticateControlRequest(expired.input, expired.configuration, expired.replayStore),
    ).rejects.toMatchObject({ code: 'timestamp_outside_window' })
  })

  it('enforces capability authorization after authentication', () => {
    const actor: ActorIdentity = {
      capabilities: ['status:read'],
      id: 'operator:test',
      kind: 'operator' as const,
    }
    expect(() => requireCapability(actor, 'status:read')).not.toThrow()
    expect(() => requireCapability(actor, 'infrastructure-operation:create')).toThrow(
      AuthorizationError,
    )
  })

  it('verifies every required GitHub OIDC policy claim', async () => {
    const policy = parseGitHubOidcPolicy({
      audience: 'control-api',
      capabilities: ['application-job:create'],
      environment: 'production',
      issuer: 'https://token.actions.githubusercontent.com',
      jwksUrl: 'https://token.actions.githubusercontent.com/.well-known/jwks',
      ref: 'refs/heads/main',
      repository: 'owner/repository',
      workflowRef: 'owner/repository/.github/workflows/deploy.yml@refs/heads/main',
    })
    const { privateKey, publicKey } = await generateKeyPair('RS256')

    async function token(overrides: Readonly<Record<string, string>> = {}) {
      const claims = {
        environment: 'production',
        job_workflow_ref: 'owner/repository/.github/workflows/deploy.yml@refs/heads/main',
        ref: 'refs/heads/main',
        repository: 'owner/repository',
        sub: 'repo:owner/repository:environment:production',
        ...overrides,
      }
      return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(overrides.iss ?? policy.issuer)
        .setAudience(policy.audience)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey)
    }

    await expect(validateGitHubOidcToken(await token(), policy, publicKey)).resolves.toEqual({
      capabilities: ['application-job:create'],
      id: `github:owner/repository:${policy.workflowRef}`,
      kind: 'github-actions',
    })

    for (const invalidClaims of [
      { repository: 'other/repository' },
      { ref: 'refs/heads/untrusted' },
      { environment: 'preview' },
      { job_workflow_ref: 'owner/repository/.github/workflows/other.yml@refs/heads/main' },
    ]) {
      await expect(
        validateGitHubOidcToken(await token(invalidClaims), policy, publicKey),
      ).rejects.toBeInstanceOf(AuthenticationError)
    }
    await expect(
      validateGitHubOidcToken(
        await token({ iss: 'https://issuer.example.invalid' }),
        policy,
        publicKey,
      ),
    ).rejects.toBeInstanceOf(AuthenticationError)
  })
})
