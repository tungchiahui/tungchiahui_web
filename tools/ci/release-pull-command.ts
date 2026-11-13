import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { controlRequest } from '../control/client'
export function parseReleasePullCommand(args: readonly string[]) {
  const action = z.enum(['enable', 'disable']).parse(args[0])
  const values: Record<string, string> = {}
  for (let i = 1; i < args.length; i += 2) {
    const key = z.enum(['--confirm', '--reason', '--idempotency-key']).parse(args[i])
    if (key in values) throw new Error('Duplicate release-pull option')
    values[key] = z
      .string()
      .min(1)
      .parse(args[i + 1])
  }
  z.literal('RELEASE-PULL-PRODUCTION').parse(values['--confirm'])
  return {
    kind: 'release-pull-configure' as const,
    enabled: action === 'enable',
    reason: z.string().trim().min(1).max(1000).parse(values['--reason']),
    idempotencyKey: values['--idempotency-key'] ?? `release-pull:${randomUUID()}`,
  }
}
export function configurePublishedReleases(command: ReturnType<typeof parseReleasePullCommand>) {
  return controlRequest('/api/ops/infrastructure-operations', {
    method: 'POST',
    purpose: 'configure-release-pull',
    idempotencyKey: command.idempotencyKey,
    body: {
      operationType: 'server-migration',
      reason: command.reason,
      target: {
        action: 'configure-release-pull',
        enabled: command.enabled,
        confirmation: 'RELEASE-PULL-PRODUCTION',
      },
    },
  })
}
