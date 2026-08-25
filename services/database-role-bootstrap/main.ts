import { readFileSync } from 'node:fs'

import { Client } from 'pg'
import { z } from 'zod'

const loginName = z.string().regex(/^[a-z][a-z0-9_]{2,62}$/)
const secret = z.string().min(32)

const configuration = z
  .object({
    DATABASE_ADMIN_URL: z.url().refine((value) => new URL(value).hostname === 'postgres', {
      message: 'Database bootstrap must use the internal postgres service',
    }),
    SITE_APP_LOGIN_NAME: loginName,
    SITE_APP_LOGIN_PASSWORD: secret,
    SITE_CONTENT_WORKER_LOGIN_NAME: loginName,
    SITE_CONTENT_WORKER_LOGIN_PASSWORD: secret,
    SITE_CONTROL_API_LOGIN_NAME: loginName,
    SITE_CONTROL_API_LOGIN_PASSWORD: secret,
    SITE_MIGRATOR_LOGIN_NAME: loginName,
    SITE_MIGRATOR_LOGIN_PASSWORD: secret,
  })
  .superRefine((value, context) => {
    const names = [
      value.SITE_APP_LOGIN_NAME,
      value.SITE_CONTENT_WORKER_LOGIN_NAME,
      value.SITE_CONTROL_API_LOGIN_NAME,
      value.SITE_MIGRATOR_LOGIN_NAME,
    ]
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: 'custom', message: 'Database login names must be distinct' })
    }
    if (names.some((name) => !name.endsWith('_login'))) {
      context.addIssue({
        code: 'custom',
        message: 'Database login identities must use the *_login suffix',
      })
    }
  })
  .parse(process.env)

type LoginBinding = Readonly<{
  groupRole: 'site_app' | 'site_content_worker' | 'site_control_api' | 'site_migrator'
  loginName: string
  password: string
}>

const groupRoles = [
  'site_app',
  'site_content_worker',
  'site_control_api',
  'site_migrator',
  'site_backup',
  'site_replication',
] as const

const bindings: readonly LoginBinding[] = [
  {
    groupRole: 'site_app',
    loginName: configuration.SITE_APP_LOGIN_NAME,
    password: configuration.SITE_APP_LOGIN_PASSWORD,
  },
  {
    groupRole: 'site_content_worker',
    loginName: configuration.SITE_CONTENT_WORKER_LOGIN_NAME,
    password: configuration.SITE_CONTENT_WORKER_LOGIN_PASSWORD,
  },
  {
    groupRole: 'site_control_api',
    loginName: configuration.SITE_CONTROL_API_LOGIN_NAME,
    password: configuration.SITE_CONTROL_API_LOGIN_PASSWORD,
  },
  {
    groupRole: 'site_migrator',
    loginName: configuration.SITE_MIGRATOR_LOGIN_NAME,
    password: configuration.SITE_MIGRATOR_LOGIN_PASSWORD,
  },
]

async function formatStatement(client: Client, format: string, values: readonly string[]) {
  const result = await client.query<{ statement: string }>(
    'SELECT format($1, VARIADIC $2::text[]) AS statement',
    [format, values],
  )
  const statement = result.rows[0]?.statement
  if (!statement) throw new Error('PostgreSQL did not format the role statement')
  return statement
}

async function reconcileLogin(client: Client, binding: LoginBinding) {
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
    binding.loginName,
  ])
  const roleStatement = await formatStatement(
    client,
    exists.rowCount === 0
      ? 'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L'
      : 'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    [binding.loginName, binding.password],
  )
  await client.query(roleStatement)
  for (const groupRole of groupRoles) {
    if (groupRole === binding.groupRole) continue
    await client.query(
      await formatStatement(client, 'REVOKE %I FROM %I', [groupRole, binding.loginName]),
    )
  }
  await client.query(
    await formatStatement(client, 'GRANT %I TO %I', [binding.groupRole, binding.loginName]),
  )
}

async function main() {
  const client = new Client({
    application_name: 'site-production-role-bootstrap',
    connectionString: configuration.DATABASE_ADMIN_URL,
  })
  await client.connect()
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('tungchiahui-production-role-bootstrap'))")
    await client.query(readFileSync('/app/dist/bootstrap/roles.sql', 'utf8'))
    for (const binding of bindings) await reconcileLogin(client, binding)
    console.log(
      JSON.stringify({
        event: 'database_roles_reconciled',
        loginNames: bindings.map((binding) => binding.loginName),
      }),
    )
  } finally {
    try {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('tungchiahui-production-role-bootstrap'))",
      )
    } finally {
      await client.end()
    }
  }
}

void main().catch(() => {
  console.error(JSON.stringify({ event: 'database_role_bootstrap_failed' }))
  process.exitCode = 1
})
