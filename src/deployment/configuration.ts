import { z } from 'zod'

export const deploymentConfigurationSchema = z
  .object({
    DEPLOYMENT_ACTIVE_SLOT_CONFIG_PATH: z.string().startsWith('/deployment-config/'),
    DEPLOYMENT_ARTICLE_PATH: z.string().startsWith('/'),
    DEPLOYMENT_ASSET_PATH: z.string().startsWith('/'),
    DEPLOYMENT_BACKUP_MAX_AGE_SECONDS: z.coerce.number().int().positive().max(31_536_000),
    DEPLOYMENT_BLUE_CONTAINER_NAME: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/),
    DEPLOYMENT_BLUE_URL: z.url().startsWith('http://'),
    DEPLOYMENT_GREEN_CONTAINER_NAME: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/),
    DEPLOYMENT_GREEN_URL: z.url().startsWith('http://'),
    DEPLOYMENT_JOURNAL_PATH: z.string().startsWith('/app/deployment/'),
    DEPLOYMENT_MIGRATION_CONTAINER_NAME: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/),
    DEPLOYMENT_MIGRATION_POLICY_PATH: z.string().startsWith('/app/deployment/'),
    DEPLOYMENT_OPENRESTY_CONTAINER_NAME: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/),
    DEPLOYMENT_POLLING_ENABLED: z.enum(['true', 'false']).default('true'),
    DEPLOYMENT_PUBLIC_ENTRY_URL: z.url().startsWith('https://'),
    DEPLOYMENT_SEARCH_QUERY: z.string().trim().min(1).max(200),
    DEPLOYMENT_STABILIZATION_SECONDS: z.coerce.number().int().nonnegative().max(86_400),
  })
  .strict()

export type DeploymentConfiguration = Readonly<z.infer<typeof deploymentConfigurationSchema>>

export function parseDeploymentConfiguration(environment: NodeJS.ProcessEnv) {
  return deploymentConfigurationSchema.parse({
    DEPLOYMENT_ACTIVE_SLOT_CONFIG_PATH: environment.DEPLOYMENT_ACTIVE_SLOT_CONFIG_PATH,
    DEPLOYMENT_ARTICLE_PATH: environment.DEPLOYMENT_ARTICLE_PATH,
    DEPLOYMENT_ASSET_PATH: environment.DEPLOYMENT_ASSET_PATH,
    DEPLOYMENT_BACKUP_MAX_AGE_SECONDS: environment.DEPLOYMENT_BACKUP_MAX_AGE_SECONDS,
    DEPLOYMENT_BLUE_CONTAINER_NAME: environment.DEPLOYMENT_BLUE_CONTAINER_NAME,
    DEPLOYMENT_BLUE_URL: environment.DEPLOYMENT_BLUE_URL,
    DEPLOYMENT_GREEN_CONTAINER_NAME: environment.DEPLOYMENT_GREEN_CONTAINER_NAME,
    DEPLOYMENT_GREEN_URL: environment.DEPLOYMENT_GREEN_URL,
    DEPLOYMENT_JOURNAL_PATH: environment.DEPLOYMENT_JOURNAL_PATH,
    DEPLOYMENT_MIGRATION_CONTAINER_NAME: environment.DEPLOYMENT_MIGRATION_CONTAINER_NAME,
    DEPLOYMENT_MIGRATION_POLICY_PATH: environment.DEPLOYMENT_MIGRATION_POLICY_PATH,
    DEPLOYMENT_OPENRESTY_CONTAINER_NAME: environment.DEPLOYMENT_OPENRESTY_CONTAINER_NAME,
    DEPLOYMENT_POLLING_ENABLED: environment.DEPLOYMENT_POLLING_ENABLED,
    DEPLOYMENT_PUBLIC_ENTRY_URL: environment.DEPLOYMENT_PUBLIC_ENTRY_URL,
    DEPLOYMENT_SEARCH_QUERY: environment.DEPLOYMENT_SEARCH_QUERY,
    DEPLOYMENT_STABILIZATION_SECONDS: environment.DEPLOYMENT_STABILIZATION_SECONDS,
  })
}
