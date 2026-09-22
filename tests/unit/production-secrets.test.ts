import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import {
  createPostgresScramVerifier,
  parsePgbouncerScramUserlist,
  verifyPostgresScramVerifier,
} from '../../src/database/postgres-scram'
import {
  exportProductionConfiguration,
  restoreProductionConfiguration,
} from '../../tools/production/config-backup'
import { createProductionEnvironmentContentsFromLegacySopsDocument } from '../../tools/production/convert-legacy-sops-to-env'
import { analyzeServiceEnvironment } from '../../tools/production/doctor'
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

const productionConfigurationLines = [
  'TUNGCHIAHUI_BACKUP_REPLICATION_CONCURRENCY=8',
  'TUNGCHIAHUI_CONTENT_POLLING_ENABLED=true',
  'TUNGCHIAHUI_SEARCH_POLLING_ENABLED=true',
  'TUNGCHIAHUI_CONTROL_RATE_LIMIT_PER_MINUTE=120',
  'TUNGCHIAHUI_DEPLOYMENT_ARTICLE_PATH=/blog/representative',
  'TUNGCHIAHUI_DEPLOYMENT_ASSET_PATH=/docs/representative.html',
  'TUNGCHIAHUI_DEPLOYMENT_BACKUP_MAX_AGE_SECONDS=172800',
  'TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY=ghcr.io/tungchiahui/tungchiahui_web',
  'TUNGCHIAHUI_DEPLOYMENT_SEARCH_QUERY=ROS2_Control',
  'TUNGCHIAHUI_ORIGIN_BIND_ADDRESS=127.0.0.1',
  'TUNGCHIAHUI_ORIGIN_PORT=3100',
  'TUNGCHIAHUI_OBSERVABILITY_BACKUP_MAX_AGE_SECONDS=172800',
  'TUNGCHIAHUI_OBSERVABILITY_DISK_CRITICAL_PERCENT=90',
  'TUNGCHIAHUI_OBSERVABILITY_INTERVAL_SECONDS=30',
  'TUNGCHIAHUI_OBSERVABILITY_JOB_MAX_AGE_SECONDS=900',
  'TUNGCHIAHUI_OBSERVABILITY_LATENCY_WARNING_MS=2000',
  'TUNGCHIAHUI_OBSERVABILITY_ORIGIN_HOSTNAME=ddns.tungchiahui.cn',
  'TUNGCHIAHUI_OBSERVABILITY_ORIGIN_IPV6_REQUIRED=true',
  'TUNGCHIAHUI_OBSERVABILITY_ORIGIN_SERVER_NAME=ddns.tungchiahui.cn',
  'TUNGCHIAHUI_OBSERVABILITY_ORIGIN_URL=https://ddns.tungchiahui.cn:8443/api/ready',
  'TUNGCHIAHUI_OBSERVABILITY_PUBLIC_ASSET_PATH=/api/assets/monitoring/health.svg',
  'TUNGCHIAHUI_OBSERVABILITY_PUBLIC_SERVER_NAME=www.tungchiahui.cn',
  'TUNGCHIAHUI_OBSERVABILITY_PUBLIC_URL=https://www.tungchiahui.cn/',
  'TUNGCHIAHUI_OBSERVABILITY_RESTORE_DRILL_MAX_AGE_SECONDS=2678400',
  'TUNGCHIAHUI_OBSERVABILITY_RESTORE_DRILL_TIMESTAMP=2026-09-01T00:00:00.000Z',
] as const

describe('production secret initialization', () => {
  it('exports and restores a validated env without reusing the production backup recipient', () => {
    const directory = mkdtempSync(join(tmpdir(), 'production-config-backup-'))
    try {
      const productionRecipient = `age1${'p'.repeat(58)}`
      const recoveryRecipient = `age1${'r'.repeat(58)}`
      const contents = createProductionEnvironmentContents('AGE-SECRET-KEY-1EXAMPLE', {
        crv: 'Ed25519',
        kty: 'OKP',
        x: 'test-public-key-material',
      })
        .replace('REPLACE_WITH_LAST_RESTORE_DRILL_TIMESTAMP', '2026-09-01T00:00:00.000Z')
        .replace('https://REPLACE_WITH_ASSET_S3_ENDPOINT', 'https://assets.example.test')
        .replace('REPLACE_WITH_ASSET_BUCKET', 'assets')
        .replace('REPLACE_WITH_READ_ONLY_ASSET_ACCESS_KEY', 'asset-access')
        .replace('REPLACE_WITH_READ_ONLY_ASSET_SECRET_KEY', 'asset-secret')
        .replace('age1REPLACE_WITH_BACKUP_PUBLIC_RECIPIENT', productionRecipient)
        .replace(
          'https://REPLACE_WITH_SAME_ALIST_ENDPOINT_AS_ASSET_S3',
          'https://alist.example.test',
        )
        .replace('REPLACE_WITH_SAME_ALIST_BUCKET_AS_ASSET_S3', 'backups')
        .replace('REPLACE_WITH_SAME_ALIST_ACCESS_KEY_AS_ASSET_S3', 'backup-access')
        .replace('REPLACE_WITH_SAME_ALIST_SECRET_KEY_AS_ASSET_S3', 'backup-secret')
        .replace('https://REPLACE_WITH_OFFSITE_S3_ENDPOINT', 'https://offsite.example.test')
        .replace('REPLACE_WITH_OFFSITE_BACKUP_BUCKET', 'offsite-backups')
        .replace('REPLACE_WITH_OFFSITE_BACKUP_ACCESS_KEY', 'offsite-access')
        .replace('REPLACE_WITH_OFFSITE_BACKUP_SECRET_KEY', 'offsite-secret')
        .replace('REPLACE_WITH_GHCR_USERNAME', 'registry-user')
        .replace('REPLACE_WITH_GHCR_PACKAGE_READ_TOKEN', 'registry-token-value')
      const envFile = join(directory, '.env')
      const encryptedFile = join(directory, 'production.env.age')
      const identityFile = join(directory, 'recovery-identity.txt')
      const restoredFile = join(directory, 'restored.env')
      writeFileSync(envFile, contents, { mode: 0o600 })
      writeFileSync(identityFile, 'offline identity', { mode: 0o600 })

      expect(() =>
        exportProductionConfiguration(
          { envFile, outputFile: encryptedFile, recipient: productionRecipient },
          () => Buffer.from('must not be called'),
        ),
      ).toThrow('must use a recovery recipient')
      exportProductionConfiguration(
        { envFile, outputFile: encryptedFile, recipient: recoveryRecipient },
        () => Buffer.from('encrypted production configuration'),
      )
      restoreProductionConfiguration(
        { identityFile, inputFile: encryptedFile, outputFile: restoredFile },
        () => Buffer.from(contents),
      )

      expect(readFileSync(restoredFile, 'utf8')).toBe(contents)
      expect(statSync(encryptedFile).mode & 0o777).toBe(0o600)
      expect(statSync(restoredFile).mode & 0o777).toBe(0o600)
      expect(() =>
        restoreProductionConfiguration(
          { identityFile, inputFile: encryptedFile, outputFile: restoredFile },
          () => Buffer.from(contents),
        ),
      ).toThrow('Refusing to overwrite')
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })

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
      ...productionConfigurationLines,
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
    expect(() => validateProductionEnvironmentContents(`${valid}\nPOSTGRES_DB=duplicate`)).toThrow(
      'duplicate key: POSTGRES_DB',
    )
    expect(() =>
      validateProductionEnvironmentContents(`${valid}\nUNKNOWN_PRODUCTION_KEY=value`),
    ).toThrow()
  })

  it('detects stale and over-broad live service environments without exposing values', () => {
    const production = {
      CONTROL_API_DATABASE_URL: 'postgresql://control-secret',
      POSTGRES_PASSWORD: 'bootstrap-secret',
      WEB_DATABASE_URL: 'postgresql://web-secret',
    }
    const configured = {
      DATABASE_URL: '$' + '{WEB_DATABASE_URL:?required}',
      SITE_RUNTIME_MODE: 'production',
    }
    expect(
      analyzeServiceEnvironment('web-blue', configured, production, [
        'DATABASE_URL=postgresql://stale-web-secret',
        'POSTGRES_PASSWORD=bootstrap-secret',
        'SITE_RUNTIME_MODE=production',
      ]),
    ).toEqual([
      { key: 'POSTGRES_PASSWORD', kind: 'disallowed-production-key', service: 'web-blue' },
      { key: 'DATABASE_URL', kind: 'stale-value', service: 'web-blue' },
    ])
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
