import { z } from 'zod'

import { initializeControlState } from '../../src/control-plane/control-state'
import { enqueueScheduledBackup, productionBackupSchedule } from '../../src/recovery/schedule'

const configuration = z
  .object({
    CONTROL_STATE_PATH: z.string().startsWith('/control-state/'),
    SITE_RUNTIME_MODE: z.literal('production'),
  })
  .parse(process.env)

initializeControlState(configuration.CONTROL_STATE_PATH, 'production')
const result = enqueueScheduledBackup(configuration.CONTROL_STATE_PATH)
console.log(
  JSON.stringify({
    databaseBackupType: result.operation.target.databaseBackupType,
    created: result.created,
    event: 'scheduled_daily_protection_enqueued',
    operationId: result.operation.id,
    schedule: productionBackupSchedule,
  }),
)
