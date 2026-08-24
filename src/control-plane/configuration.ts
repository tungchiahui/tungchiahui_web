import { z } from 'zod'

import { type AuthenticationConfiguration, parseGitHubOidcPolicy, parseOperatorKeys } from './auth'
import { capabilityValues } from './contracts'

const configurationSchema = z.object({
  CONTROL_API_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
  CONTROL_API_PORT: z.coerce.number().int().min(1024).max(65_535),
  CONTROL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  CONTROL_REPLAY_WINDOW_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  CONTROL_STATE_PATH: z.string().startsWith('/control-state/'),
  DATABASE_URL: z.string().url().optional(),
  SITE_RUNTIME_MODE: z.enum(['local', 'test']),
})

const localOperatorPublicJwk = Object.freeze({
  crv: 'Ed25519' as const,
  kty: 'OKP' as const,
  x: 'uJHy1WFXYWvg7oHPHG-_UBg_krmBWEc4vN3DlUNr_NA',
})

export function parseControlApiConfiguration(input: unknown) {
  const parsed = configurationSchema.parse(input)
  const authentication: AuthenticationConfiguration = Object.freeze({
    github: parseGitHubOidcPolicy({
      audience: 'tungchiahui-control-api',
      capabilities: capabilityValues,
      environment: 'production',
      issuer: 'https://token.actions.githubusercontent.com',
      jwksUrl: 'https://token.actions.githubusercontent.com/.well-known/jwks',
      ref: 'refs/heads/main',
      repository: 'tungchiahui/tungchiahui_web',
      workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/deploy.yml@refs/heads/main',
    }),
    operatorKeys: parseOperatorKeys([
      {
        actorId: `local-operator:${parsed.SITE_RUNTIME_MODE}`,
        capabilities: capabilityValues,
        keyId: 'local-phase4-operator',
        publicKeyJwk: localOperatorPublicJwk,
      },
    ]),
    replayWindowSeconds: parsed.CONTROL_REPLAY_WINDOW_SECONDS,
  })

  return Object.freeze({
    authentication,
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.CONTROL_API_HOST,
    mode: parsed.SITE_RUNTIME_MODE,
    port: parsed.CONTROL_API_PORT,
    rateLimitPerMinute: parsed.CONTROL_RATE_LIMIT_PER_MINUTE,
    statePath: parsed.CONTROL_STATE_PATH,
  })
}

export type ControlApiConfiguration = ReturnType<typeof parseControlApiConfiguration>
