import { z } from 'zod'

import { type AuthenticationConfiguration, parseGitHubOidcPolicy, parseOperatorKeys } from './auth'
import { capabilityValues } from './contracts'

const configurationSchema = z.object({
  CONTROL_API_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
  CONTROL_API_PORT: z.coerce.number().int().min(1024).max(65_535),
  CONTROL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  CONTROL_REPLAY_WINDOW_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  CONTROL_STATE_PATH: z.string().startsWith('/control-state/'),
  CONTROL_GITHUB_OIDC_POLICY_JSON: z.string().min(2).optional(),
  CONTROL_OPERATOR_KEYS_JSON: z.string().min(2).optional(),
  DATABASE_URL: z.string().url().optional(),
  SITE_RUNTIME_MODE: z.enum(['local', 'test', 'production']),
})

const localOperatorPublicJwk = Object.freeze({
  crv: 'Ed25519' as const,
  kty: 'OKP' as const,
  x: 'uJHy1WFXYWvg7oHPHG-_UBg_krmBWEc4vN3DlUNr_NA',
})

export function parseControlApiConfiguration(input: unknown) {
  const parsed = configurationSchema.parse(input)
  const production = parsed.SITE_RUNTIME_MODE === 'production'
  if (
    production &&
    (parsed.CONTROL_GITHUB_OIDC_POLICY_JSON === undefined ||
      parsed.CONTROL_OPERATOR_KEYS_JSON === undefined)
  ) {
    throw new Error(
      'Production control-api requires CONTROL_GITHUB_OIDC_POLICY_JSON and CONTROL_OPERATOR_KEYS_JSON',
    )
  }

  const parseJson = (value: string, name: string): unknown => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      throw new Error(`${name} must contain valid JSON`)
    }
  }

  const githubPolicy =
    parsed.CONTROL_GITHUB_OIDC_POLICY_JSON === undefined
      ? {
          audience: 'tungchiahui-control-api',
          capabilities: [
            'translation:dry-run',
            'translation:execute',
            'translation:read',
            'translation:cancel',
          ],
          environment: 'production',
          issuer: 'https://token.actions.githubusercontent.com',
          jwksUrl: 'https://token.actions.githubusercontent.com/.well-known/jwks',
          ref: 'refs/heads/main',
          repository: 'tungchiahui/tungchiahui_web',
          workflowRef:
            'tungchiahui/tungchiahui_web/.github/workflows/translation.yml@refs/heads/main',
        }
      : parseJson(parsed.CONTROL_GITHUB_OIDC_POLICY_JSON, 'CONTROL_GITHUB_OIDC_POLICY_JSON')
  const operatorKeys =
    parsed.CONTROL_OPERATOR_KEYS_JSON === undefined
      ? [
          {
            actorId: `local-operator:${parsed.SITE_RUNTIME_MODE}`,
            capabilities: capabilityValues,
            keyId: 'local-phase4-operator',
            publicKeyJwk: localOperatorPublicJwk,
          },
        ]
      : parseJson(parsed.CONTROL_OPERATOR_KEYS_JSON, 'CONTROL_OPERATOR_KEYS_JSON')
  const authentication: AuthenticationConfiguration = Object.freeze({
    github: parseGitHubOidcPolicy(githubPolicy),
    operatorKeys: parseOperatorKeys(operatorKeys),
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
