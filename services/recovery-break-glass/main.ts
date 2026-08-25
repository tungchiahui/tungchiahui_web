import { z } from 'zod'

import {
  authorizeBreakGlassRestore,
  breakGlassRestorePayloadSchema,
} from '../../src/recovery/break-glass'

const index = process.argv.indexOf('--request-base64')
const encodedRequest = process.argv[index + 1]
if (index < 0 || !encodedRequest) throw new Error('Missing break-glass request payload')
const payload = breakGlassRestorePayloadSchema.parse(
  JSON.parse(Buffer.from(encodedRequest, 'base64url').toString('utf8')) as unknown,
)
const statePath = z.string().startsWith('/control-state/').parse(process.env.CONTROL_STATE_PATH)
const result = authorizeBreakGlassRestore(statePath, payload)
console.log(JSON.stringify(result))
