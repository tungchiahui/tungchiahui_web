import { storageObjectKeySchema } from '../storage/contracts'

export const RECOVERY_OBJECT_PREFIX = 'backups' as const

export function recoveryObjectKey(key: string) {
  return storageObjectKeySchema.parse(`${RECOVERY_OBJECT_PREFIX}/${key}`)
}
