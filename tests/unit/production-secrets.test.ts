import { describe, expect, it } from 'vitest'
import {
  createPostgresScramVerifier,
  parsePgbouncerScramUserlist,
  verifyPostgresScramVerifier,
} from '../../src/database/postgres-scram'
import { createProductionEnvironmentContentsFromLegacySopsDocument } from '../../tools/production/convert-legacy-sops-to-env'
import {
  createProductionEnvironmentContents,
  validateProductionEnvironmentContents,
} from '../../tools/production/initialize-secrets'

const releaseOidcPolicy = JSON.stringify([
  { workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/release.yml@refs/heads/main' },
])

const legacyDeployOidcPolicy = JSON.stringify([
  { workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/deploy.yml@refs/heads/main' },
])

describe('production secret initialization', () => {
  it('creates a PostgreSQL-compatible SCRAM-SHA-256 verifier without exposing the password', () => {
    const verifier = createPostgresScramVerifier(
      'a-production-password-that-must-not-appear',
      Buffer.from('0123456789abcdef'),
    )

    expect(verifier).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/,
    )
    expect(verifier).not.toContain('a-production-password-that-must-not-appear')
    expect(
      verifyPostgresScramVerifier('a-production-password-that-must-not-appear', verifier),
    ).toBe(true)
    expect(verifyPostgresScramVerifier('a-different-production-password', verifier)).toBe(false)
  })

  it('accepts only unique PgBouncer identities with valid SCRAM verifiers', () => {
    const verifier = createPostgresScramVerifier('phase18-test-password-value')
    const parsed = parsePgbouncerScramUserlist(`"site_app_login" "${verifier}"\n`)
    expect(parsed.get('site_app_login')).toBe(verifier)
    expect(() =>
      parsePgbouncerScramUserlist(`"site_app_login" "${verifier}"\n"site_app_login" "${verifier}"`),
    ).toThrow('Duplicate PgBouncer login identity')
    expect(() => parsePgbouncerScramUserlist('"site_app_login" "plain-text-password"')).toThrow(
      'Invalid PostgreSQL SCRAM-SHA-256 verifier',
    )
  })

  it('rejects single-env payloads that still contain operator placeholders', () => {
    const verifier = createPostgresScramVerifier('phase22-password')
    const env = [
      'POSTGRES_DB=tungchiahui',
      'POSTGRES_USER=tungchiahui',
      'POSTGRES_PASSWORD=postgres-password-value',
      `PGBACKREST_REPO1_CIPHER_PASS=${'x'.repeat(48)}`,
      'WEB_DATABASE_URL=postgresql://site_app_login:app-password-value@pgbouncer:6432/tungchiahui',
      'CONTROL_API_DATABASE_URL=postgresql://site_control_api_login:control-password-value@pgbouncer:6432/tungchiahui',
      'CONTENT_WORKER_DATABASE_URL=postgresql://site_content_worker_login:worker-password-value@pgbouncer:6432/tungchiahui',
      'DATABASE_MIGRATE_URL=postgresql://site_migrator_login:migrator-password-value@postgres:5432/tungchiahui',
      'DATABASE_ADMIN_URL=postgresql://tungchiahui:postgres-password-value@postgres:5432/tungchiahui',
      'SITE_APP_LOGIN_NAME=site_app_login',
      'SITE_APP_LOGIN_PASSWORD=app-password-value',
      'SITE_CONTENT_WORKER_LOGIN_NAME=site_content_worker_login',
      'SITE_CONTENT_WORKER_LOGIN_PASSWORD=worker-password-value',
      'SITE_CONTROL_API_LOGIN_NAME=site_control_api_login',
      'SITE_CONTROL_API_LOGIN_PASSWORD=control-password-value',
      'SITE_MIGRATOR_LOGIN_NAME=site_migrator_login',
      'SITE_MIGRATOR_LOGIN_PASSWORD=migrator-password-value',
      'SITE_BASE_URL=https://www.example.com',
      'SITE_REVALIDATION_SECRET=phase22-revalidation-secret-value-0001',
      'GITHUB_CONTENT_REPOSITORY=tungchiahui/tungchiahui_content',
      'CONTROL_OPERATOR_KEYS_JSON=[]',
      `CONTROL_GITHUB_OIDC_POLICY_JSON=${releaseOidcPolicy}`,
      'ASSET_S3_ENDPOINT=https://assets.example.test',
      'ASSET_S3_REGION=us-east-1',
      'ASSET_S3_BUCKET=assets',
      'ASSET_S3_ACCESS_KEY_ID=asset-key',
      'ASSET_S3_SECRET_ACCESS_KEY=asset-secret',
      'ASSET_S3_FORCE_PATH_STYLE=true',
      'BACKUP_AGE_RECIPIENT=age1recipient',
      `BACKUP_AGE_IDENTITY_BASE64=${Buffer.from('AGE-SECRET-KEY-1EXAMPLE').toString('base64')}`,
      'BACKUP_S3_ENDPOINT=https://alist.example.test',
      'BACKUP_S3_REGION=us-east-1',
      'BACKUP_S3_BUCKET=production-backups',
      'BACKUP_S3_ACCESS_KEY_ID=backup-key',
      'BACKUP_S3_SECRET_ACCESS_KEY=backup-secret',
      'BACKUP_S3_FORCE_PATH_STYLE=true',
      'BACKUP_OFFSITE_S3_ENDPOINT=https://account.r2.cloudflarestorage.com',
      'BACKUP_OFFSITE_S3_REGION=auto',
      'BACKUP_OFFSITE_S3_BUCKET=r2-offsite-backup',
      'BACKUP_OFFSITE_S3_ACCESS_KEY_ID=r2-backup-key',
      'BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY=REPLACE_WITH_R2_SECRET',
      'BACKUP_OFFSITE_S3_FORCE_PATH_STYLE=false',
      'DEPLOYMENT_REGISTRY_USERNAME=owner',
      'DEPLOYMENT_REGISTRY_TOKEN=deployment-registry-token-value',
      `PGBOUNCER_USERLIST_BASE64=${Buffer.from(`"worker" "${verifier}"`).toString('base64')}`,
    ].join('\n')

    expect(() => validateProductionEnvironmentContents(env)).toThrow(
      'Production env is incomplete: 1 placeholder values remain',
    )
    const valid = env.replace('REPLACE_WITH_R2_SECRET', 'r2-backup-secret')
    expect(() => validateProductionEnvironmentContents(valid)).not.toThrow()
    expect(() =>
      validateProductionEnvironmentContents(`${valid}\nBACKUP_R2_BUCKET=obsolete`),
    ).toThrow('obsolete BACKUP_R2_* keys')
    expect(() =>
      validateProductionEnvironmentContents(
        valid.replace(
          `CONTROL_GITHUB_OIDC_POLICY_JSON=${releaseOidcPolicy}`,
          'CONTROL_GITHUB_OIDC_POLICY_JSON=[]',
        ),
      ),
    ).toThrow('must authorize release.yml')
  })

  it('converts the retired SOPS document shape into one validated production env', () => {
    const appVerifier = createPostgresScramVerifier('phase22-app-password')
    const controlVerifier = createPostgresScramVerifier('phase22-control-password')
    const workerVerifier = createPostgresScramVerifier('phase22-worker-password')
    const migratorVerifier = createPostgresScramVerifier('phase22-migrator-password')
    const contents = createProductionEnvironmentContentsFromLegacySopsDocument({
      backup_age_identity: 'AGE-SECRET-KEY-1EXAMPLE',
      backup_env: [
        `PGBACKREST_REPO1_CIPHER_PASS=${'x'.repeat(48)}`,
        'BACKUP_AGE_RECIPIENT=age1recipient',
        'BACKUP_S3_ENDPOINT=https://alist.example.test',
        'BACKUP_S3_REGION=us-east-1',
        'BACKUP_S3_BUCKET=production-backups',
        'BACKUP_S3_ACCESS_KEY_ID=backup-key',
        'BACKUP_S3_SECRET_ACCESS_KEY=backup-secret',
        'BACKUP_S3_FORCE_PATH_STYLE=true',
        'BACKUP_OFFSITE_S3_ENDPOINT=https://account.r2.cloudflarestorage.com',
        'BACKUP_OFFSITE_S3_REGION=auto',
        'BACKUP_OFFSITE_S3_BUCKET=r2-offsite-backup',
        'BACKUP_OFFSITE_S3_ACCESS_KEY_ID=r2-backup-key',
        'BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY=r2-backup-secret',
        'BACKUP_OFFSITE_S3_FORCE_PATH_STYLE=false',
      ].join('\n'),
      content_worker_env: [
        'DATABASE_URL=postgresql://site_content_worker_login:worker-password-value@pgbouncer:6432/tungchiahui',
        'GITHUB_CONTENT_REPOSITORY=tungchiahui/tungchiahui_content',
        'GITHUB_CONTENT_READ_TOKEN=',
        'SITE_REVALIDATION_SECRET=phase22-revalidation-secret-value-0001',
      ].join('\n'),
      control_api_env: [
        'DATABASE_URL=postgresql://site_control_api_login:control-password-value@pgbouncer:6432/tungchiahui',
        'CONTROL_OPERATOR_KEYS_JSON=[]',
        `CONTROL_GITHUB_OIDC_POLICY_JSON=${legacyDeployOidcPolicy}`,
        'OWNER_PASSWORD_HASH=scrypt:00112233445566778899aabbccddeeff:'.concat('a'.repeat(128)),
      ].join('\n'),
      database_migrate_env:
        'DATABASE_URL=postgresql://site_migrator_login:migrator-password-value@postgres:5432/tungchiahui',
      database_role_bootstrap_env: [
        'DATABASE_ADMIN_URL=postgresql://tungchiahui:postgres-password-value@postgres:5432/tungchiahui',
        'SITE_APP_LOGIN_NAME=site_app_login',
        'SITE_APP_LOGIN_PASSWORD=app-password-value',
        'SITE_CONTENT_WORKER_LOGIN_NAME=site_content_worker_login',
        'SITE_CONTENT_WORKER_LOGIN_PASSWORD=worker-password-value',
        'SITE_CONTROL_API_LOGIN_NAME=site_control_api_login',
        'SITE_CONTROL_API_LOGIN_PASSWORD=control-password-value',
        'SITE_MIGRATOR_LOGIN_NAME=site_migrator_login',
        'SITE_MIGRATOR_LOGIN_PASSWORD=migrator-password-value',
      ].join('\n'),
      deployment_registry_env: [
        'DEPLOYMENT_REGISTRY_USERNAME=owner',
        'DEPLOYMENT_REGISTRY_TOKEN=deployment-registry-token-value',
      ].join('\n'),
      observability_env: [
        'OBSERVABILITY_ALERT_WEBHOOK_URL=https://alerts.example.test/tungchiahui',
        'OBSERVABILITY_ALERT_WEBHOOK_BEARER_TOKEN=observability-token-value',
      ].join('\n'),
      pgbouncer_userlist: [
        `"site_app_login" "${appVerifier}"`,
        `"site_control_api_login" "${controlVerifier}"`,
        `"site_content_worker_login" "${workerVerifier}"`,
        `"site_migrator_login" "${migratorVerifier}"`,
      ].join('\n'),
      postgres_env: [
        'POSTGRES_DB=tungchiahui',
        'POSTGRES_USER=tungchiahui',
        'POSTGRES_PASSWORD=postgres-password-value',
        `PGBACKREST_REPO1_CIPHER_PASS=${'x'.repeat(48)}`,
      ].join('\n'),
      web_env: [
        'DATABASE_URL=postgresql://site_app_login:app-password-value@pgbouncer:6432/tungchiahui',
        'SITE_BASE_URL=https://www.example.com',
        'SITE_REVALIDATION_SECRET=phase22-revalidation-secret-value-0001',
        'ASSET_S3_ENDPOINT=https://assets.example.test',
        'ASSET_S3_REGION=us-east-1',
        'ASSET_S3_BUCKET=assets',
        'ASSET_S3_ACCESS_KEY_ID=asset-key',
        'ASSET_S3_SECRET_ACCESS_KEY=asset-secret',
        'ASSET_S3_FORCE_PATH_STYLE=true',
      ].join('\n'),
    })

    expect(contents).toContain('WEB_DATABASE_URL=postgresql://site_app_login:')
    expect(contents).toContain('CONTROL_API_DATABASE_URL=postgresql://site_control_api_login:')
    expect(contents).toContain('OWNER_PASSWORD_HASH=scrypt:')
    expect(contents).toContain(
      'OBSERVABILITY_ALERT_WEBHOOK_URL=https://alerts.example.test/tungchiahui',
    )
    expect(contents).toContain('.github/workflows/release.yml@refs/heads/main')
    expect(contents).not.toContain('.github/workflows/deploy.yml@refs/heads/main')
    expect(() => validateProductionEnvironmentContents(contents)).not.toThrow()
  })

  it('generates one plaintext production env with base64 file-shaped values', () => {
    const contents = createProductionEnvironmentContents('AGE-SECRET-KEY-1EXAMPLE', {
      crv: 'Ed25519',
      kty: 'OKP',
      x: 'test-public-key-material',
    })

    expect(contents).toContain('WEB_DATABASE_URL=postgresql://site_app_login:')
    expect(contents).toContain('CONTROL_API_DATABASE_URL=postgresql://site_control_api_login:')
    expect(contents).toContain('PGBOUNCER_USERLIST_BASE64=')
    expect(contents).toContain('BACKUP_AGE_IDENTITY_BASE64=')
    expect(contents).toContain('.github/workflows/release.yml@refs/heads/main')
    expect(contents).not.toContain('production.sops.yaml')
  })
})
