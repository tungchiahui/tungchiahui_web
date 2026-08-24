import { z } from 'zod'

const rawEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  SITE_BASE_URL: z.url().optional(),
})

export type RuntimeEnvironment = Readonly<{
  nodeEnvironment: 'development' | 'test' | 'production'
  siteBaseUrl: URL
}>

export class EnvironmentValidationError extends Error {
  override readonly name = 'EnvironmentValidationError'

  constructor(issues: readonly string[]) {
    super(`Invalid runtime configuration: ${issues.join('; ')}`)
  }
}

export function parseEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): RuntimeEnvironment {
  const result = rawEnvironmentSchema.safeParse(input)

  if (!result.success) {
    throw new EnvironmentValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }

  const nodeEnvironment = result.data.NODE_ENV ?? 'development'
  const siteBaseUrl = result.data.SITE_BASE_URL

  if (nodeEnvironment === 'production' && siteBaseUrl === undefined) {
    throw new EnvironmentValidationError(['SITE_BASE_URL: required in production'])
  }

  return Object.freeze({
    nodeEnvironment,
    siteBaseUrl: new URL(siteBaseUrl ?? 'http://localhost:3000'),
  })
}
