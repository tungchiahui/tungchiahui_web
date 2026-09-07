import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { controlRequest } from '../control/client'

type BackupRequest = Readonly<{
  backupType: 'diff' | 'full' | 'incr'
  environment: 'local' | 'production' | 'test'
  reason: string
}>

const backupRequestSchema = z
  .object({
    backupType: z.enum(['full', 'diff', 'incr']),
    environment: z.enum(['local', 'test', 'production']),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strip()

type RestoreRequest = Readonly<{
  confirmation: string
  environment: 'local' | 'production' | 'test'
  reason: string
  selector: Readonly<{ backupId: string }> | Readonly<{ targetTime: string }>
}>

function idempotencyKey(purpose: string) {
  return `${purpose}:cli:${randomUUID()}`
}

export function createBackup(request: BackupRequest) {
  const body = createBackupRequestBody(request)
  return controlRequest('/api/ops/backups', {
    body,
    idempotencyKey: idempotencyKey('backup'),
    method: 'POST',
    purpose: 'backup',
  })
}

export function createBackupRequestBody(request: unknown): BackupRequest {
  return Object.freeze(backupRequestSchema.parse(request))
}

export function readBackupStatus() {
  return controlRequest('/api/ops/backups/status', { purpose: 'backup-status' })
}

export function createRestore(request: RestoreRequest) {
  return controlRequest('/api/ops/restores', {
    body: request,
    idempotencyKey: idempotencyKey('restore'),
    method: 'POST',
    purpose: 'restore',
  })
}

export function createBreakGlassRestore(request: RestoreRequest, inventoryHost: string) {
  const host = z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/)
    .parse(inventoryHost)
  const payload = Buffer.from(
    JSON.stringify({
      actorId: `break-glass:${process.env.USER ?? 'operator'}`,
      idempotencyKey: idempotencyKey('break-glass-restore'),
      inventoryHost: host,
      request,
    }),
  ).toString('base64url')
  const result = spawnSync(
    'ssh',
    [
      host,
      'docker',
      'compose',
      '--project-name',
      'tungchiahui-production',
      '--file',
      '/etc/tungchiahui/compose.yaml',
      'exec',
      '--no-TTY',
      'deploy-agent',
      'node',
      'dist/recovery-break-glass.cjs',
      '--request-base64',
      payload,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  if (result.error)
    throw new Error(`Unable to invoke break-glass recovery: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`Break-glass recovery returned exit code ${String(result.status)}`)
  }
  return z.record(z.string(), z.unknown()).parse(JSON.parse(result.stdout) as unknown)
}
