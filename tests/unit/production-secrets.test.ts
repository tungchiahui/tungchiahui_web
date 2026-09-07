import { describe, expect, it } from 'vitest'
import {
  createPostgresScramVerifier,
  parsePgbouncerScramUserlist,
  verifyPostgresScramVerifier,
} from '../../src/database/postgres-scram'
import {
  createSopsEncryptArguments,
  validateProductionSecretDocument,
} from '../../tools/production/initialize-secrets'

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

  it('rejects encrypted-document payloads that still contain operator placeholders', () => {
    const document = {
      backup_age_identity: 'AGE-SECRET-KEY-1EXAMPLE',
      backup_env: [
        'PGBACKREST_REPO1_CIPHER_PASS=cipher',
        'BACKUP_AGE_RECIPIENT=age1recipient',
        'BACKUP_S3_ENDPOINT=https://alist.example.test',
        'BACKUP_S3_REGION=us-east-1',
        'BACKUP_S3_BUCKET=REPLACE_WITH_BACKUP_BUCKET',
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
      content_worker_env: 'DATABASE_URL=postgresql://worker:secret@pgbouncer:6432/database',
      control_api_env: 'DATABASE_URL=postgresql://control:secret@pgbouncer:6432/database',
      database_migrate_env: 'DATABASE_URL=postgresql://migrator:secret@postgres:5432/database',
      database_role_bootstrap_env:
        'DATABASE_ADMIN_URL=postgresql://admin:secret@postgres:5432/database',
      deployment_registry_env: [
        'DEPLOYMENT_REGISTRY_USERNAME=owner',
        'DEPLOYMENT_REGISTRY_TOKEN=token',
      ].join('\n'),
      observability_env: '',
      pgbouncer_userlist: '"worker" "SCRAM-SHA-256$4096:salt$stored:server"',
      postgres_env: 'POSTGRES_PASSWORD=secret',
      web_env: [
        'DATABASE_URL=postgresql://app:secret@pgbouncer:6432/database',
        'SITE_BASE_URL=https://www.example.com',
        'SITE_REVALIDATION_SECRET=revalidation-secret',
        'ASSET_S3_ENDPOINT=https://assets.example.com',
        'ASSET_S3_REGION=us-east-1',
        'ASSET_S3_BUCKET=assets',
        'ASSET_S3_ACCESS_KEY_ID=asset-key',
        'ASSET_S3_SECRET_ACCESS_KEY=asset-secret',
        'ASSET_S3_FORCE_PATH_STYLE=true',
      ].join('\n'),
    }

    expect(() => validateProductionSecretDocument(document)).toThrow(
      'Production secrets are incomplete: 1 placeholder values remain',
    )
    expect(() =>
      validateProductionSecretDocument({
        ...document,
        backup_env: document.backup_env.replace('REPLACE_WITH_BACKUP_BUCKET', 'production-backups'),
      }),
    ).not.toThrow()

    expect(() =>
      validateProductionSecretDocument({
        ...document,
        backup_env: `${document.backup_env.replace(
          'REPLACE_WITH_BACKUP_BUCKET',
          'production-backups',
        )}\nBACKUP_R2_BUCKET=obsolete`,
      }),
    ).toThrow('obsolete BACKUP_R2_* keys')
  })

  it('uses the SOPS stdin contract without reopening /dev/stdin', () => {
    expect(createSopsEncryptArguments('age1testrecipient')).toEqual([
      'encrypt',
      '--age',
      'age1testrecipient',
      '--input-type',
      'yaml',
      '--output-type',
      'yaml',
      '--filename-override',
      'production.sops.yaml',
    ])
  })
})
