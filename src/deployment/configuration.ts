import { z } from 'zod'

const optionalNonempty = <Schema extends z.ZodType<string>>(schema: Schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

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
    DEPLOYMENT_IMAGE_REPOSITORY: optionalNonempty(
      z.string().regex(/^[a-z0-9.-]+(?::[0-9]{2,5})?\/[a-z0-9._/-]+$/),
    ),
    DEPLOYMENT_JOURNAL_PATH: z.string().startsWith('/app/deployment/'),
    DEPLOYMENT_MIGRATION_CONTAINER_NAME: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/),
    DEPLOYMENT_MIGRATION_POLICY_PATH: z.string().startsWith('/app/deployment/'),
    DEPLOYMENT_OPENRESTY_CONTAINER_NAME: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/),
    DEPLOYMENT_POLLING_ENABLED: z.enum(['true', 'false']).default('true'),
    DEPLOYMENT_PUBLIC_ENTRY_URL: z.url().startsWith('https://'),
    DEPLOYMENT_REGISTRY_TOKEN: optionalNonempty(z.string().min(16).max(10_000)),
    DEPLOYMENT_REGISTRY_USERNAME: optionalNonempty(z.string().min(1).max(200)),
    DEPLOYMENT_SEARCH_QUERY: z.string().trim().min(1).max(200),
    DEPLOYMENT_STABILIZATION_SECONDS: z.coerce.number().int().nonnegative().max(86_400),
  })
  .strict()
  .superRefine((configuration, context) => {
    if (
      (configuration.DEPLOYMENT_REGISTRY_TOKEN === undefined) !==
      (configuration.DEPLOYMENT_REGISTRY_USERNAME === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Registry username and token must be configured together',
        path: ['DEPLOYMENT_REGISTRY_TOKEN'],
      })
    }
  })

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
    DEPLOYMENT_IMAGE_REPOSITORY: environment.DEPLOYMENT_IMAGE_REPOSITORY,
    DEPLOYMENT_JOURNAL_PATH: environment.DEPLOYMENT_JOURNAL_PATH,
    DEPLOYMENT_MIGRATION_CONTAINER_NAME: environment.DEPLOYMENT_MIGRATION_CONTAINER_NAME,
    DEPLOYMENT_MIGRATION_POLICY_PATH: environment.DEPLOYMENT_MIGRATION_POLICY_PATH,
    DEPLOYMENT_OPENRESTY_CONTAINER_NAME: environment.DEPLOYMENT_OPENRESTY_CONTAINER_NAME,
    DEPLOYMENT_POLLING_ENABLED: environment.DEPLOYMENT_POLLING_ENABLED,
    DEPLOYMENT_PUBLIC_ENTRY_URL: environment.DEPLOYMENT_PUBLIC_ENTRY_URL,
    DEPLOYMENT_REGISTRY_TOKEN: environment.DEPLOYMENT_REGISTRY_TOKEN,
    DEPLOYMENT_REGISTRY_USERNAME: environment.DEPLOYMENT_REGISTRY_USERNAME,
    DEPLOYMENT_SEARCH_QUERY: environment.DEPLOYMENT_SEARCH_QUERY,
    DEPLOYMENT_STABILIZATION_SECONDS: environment.DEPLOYMENT_STABILIZATION_SECONDS,
  })
}
