import { z } from 'zod'

import type { InfrastructureOperationRequest } from '../control-plane/contracts'
import {
  actorIdentitySchema,
  infrastructureOperationRequestSchema,
} from '../control-plane/contracts'
import { createInfrastructureOperation } from '../control-plane/control-state'

export const productionBackupSchedule = Object.freeze({
  dailyAt: '03:05',
  fullWeekday: 'Sun',
  timeZone: 'Asia/Hong_Kong',
})

const schedulerActor = actorIdentitySchema.parse({
  capabilities: ['infrastructure-operation:create'],
  id: 'service:production-backup-scheduler',
  kind: 'service',
})

function localDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: productionBackupSchedule.timeZone,
    weekday: 'short',
    year: 'numeric',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    z
      .string()
      .min(1)
      .parse(parts.find((part) => part.type === type)?.value)
  return Object.freeze({
    date: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday'),
  })
}

export function scheduledBackupRequest(now = new Date()) {
  const local = localDateParts(now)
  const backupType = local.weekday === productionBackupSchedule.fullWeekday ? 'full' : 'diff'
  const request: InfrastructureOperationRequest = infrastructureOperationRequestSchema.parse({
    operationType: 'recovery',
    reason: `Scheduled ${backupType} backup for ${local.date} ${productionBackupSchedule.timeZone}`,
    target: { action: 'backup', backupType, environment: 'production' },
  })
  return Object.freeze({
    idempotencyKey: `scheduled-backup:production:${local.date}`,
    localDate: local.date,
    request,
  })
}

export function enqueueScheduledBackup(controlStatePath: string, now = new Date()) {
  const scheduled = scheduledBackupRequest(now)
  return createInfrastructureOperation(
    controlStatePath,
    scheduled.request,
    schedulerActor,
    scheduled.idempotencyKey,
    now,
  )
}
