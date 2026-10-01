import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createDailyProtectionManifest,
  type DailyProtectionServices,
  type DailyProtectionTarget,
  replicateDailyProtectionManifest,
  runDailyProtection,
} from '../../src/recovery/daily-protection'

const target: DailyProtectionTarget = {
  date: '2026-09-26',
  databaseBackupType: 'diff',
  environment: 'production',
}
const database = {
  status: 'completed' as const,
  backupId: 'backup-1',
  backupType: 'diff' as const,
  repositoryGeneration: 'generation-1',
  manifestSha256: 'a'.repeat(64),
  primaryReplicaStatus: 'fresh' as const,
  offsiteReplicaStatus: 'fresh' as const,
}
const controlState = {
  status: 'completed' as const,
  objectKey: 'backups/control-state/one.age',
  sha256: 'b'.repeat(64),
}
const assets = {
  status: 'completed' as const,
  sourceObjects: 4,
  copied: 1,
  updated: 1,
  unchanged: 2,
  targetOnlyPreserved: 3,
  manifestKey: 'asset-backups/one.json',
  manifestSha256: 'c'.repeat(64),
}

describe('unified daily protection', () => {
  it.each([0, 1])(
    'fails closed when replica %i corrupts manifest read-back',
    async (corruptReplica) => {
      const manifest = createDailyProtectionManifest(target, { database, controlState, assets })
      const puts: number[] = []
      const replica = (index: number) => ({
        putObject: vi.fn(async () => {
          puts.push(index)
          return { metadata: {} }
        }),
        getObject: vi.fn(async () => ({
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(index === corruptReplica ? new Uint8Array([1]) : manifest.body)
              controller.close()
            },
          }),
          contentType: 'application/json',
          contentLength: manifest.body.byteLength,
          metadata: {},
        })),
      })
      await expect(
        replicateDailyProtectionManifest(manifest, [replica(0), replica(1)]),
      ).rejects.toThrow('read-back hash mismatch')
      expect(puts).toEqual(corruptReplica === 0 ? [0] : [0, 1])
    },
  )

  it('does not invoke a component after fencing fails', async () => {
    const databaseCall = vi.fn(async () => database)
    const services: DailyProtectionServices = {
      findExistingDatabase: async () => null,
      database: databaseCall,
      controlState: async () => controlState,
      assets: async () => assets,
      manifest: async () => ({ key: 'key', sha256: 'd'.repeat(64) }),
    }
    await expect(
      runDailyProtection(
        target,
        null,
        services,
        () => {},
        () => {
          throw new Error('stale lease')
        },
      ),
    ).rejects.toThrow('stale lease')
    expect(databaseCall).not.toHaveBeenCalled()
  })
  it('keeps a completed database component after an asset failure and resumes only the missing component', async () => {
    const checkpoints: unknown[] = []
    const databaseCall = vi.fn(async () => database)
    const controlCall = vi.fn(async () => controlState)
    const assetCall = vi
      .fn()
      .mockRejectedValueOnce(new Error('asset copy unavailable'))
      .mockResolvedValueOnce(assets)
    const manifestCall = vi.fn(async () => ({
      key: 'backups/daily-manifests/2026-09-26.json',
      sha256: 'd'.repeat(64),
    }))
    const services: DailyProtectionServices = {
      findExistingDatabase: async () => null,
      database: databaseCall,
      controlState: controlCall,
      assets: assetCall,
      manifest: manifestCall,
    }
    await expect(
      runDailyProtection(target, null, services, (value) => checkpoints.push(value)),
    ).rejects.toThrow('asset copy unavailable')
    const failed = checkpoints.at(-1)
    expect(failed).toMatchObject({ database, controlState, failedComponent: 'assets' })
    const completed = await runDailyProtection(target, failed, services, (value) =>
      checkpoints.push(value),
    )
    expect(completed).toMatchObject({
      database,
      controlState,
      assets,
      manifestSha256: 'd'.repeat(64),
    })
    expect(databaseCall).toHaveBeenCalledTimes(1)
    expect(controlCall).toHaveBeenCalledTimes(1)
    expect(assetCall).toHaveBeenCalledTimes(2)
    expect(manifestCall).toHaveBeenCalledTimes(1)
  })

  it('reuses an already verified database backup during a timer upgrade', async () => {
    const createDatabase = vi.fn(async () => database)
    const services: DailyProtectionServices = {
      findExistingDatabase: async () => database,
      database: createDatabase,
      controlState: async () => controlState,
      assets: async () => assets,
      manifest: async () => ({
        key: 'backups/daily-manifests/2026-09-26.json',
        sha256: 'd'.repeat(64),
      }),
    }
    const result = await runDailyProtection(target, null, services, () => {})
    expect(result.database).toEqual(database)
    expect(createDatabase).not.toHaveBeenCalled()
  })

  it('makes a small integrity-checkable manifest without secrets or object bodies', () => {
    const manifest = createDailyProtectionManifest(
      target,
      { database, controlState, assets },
      new Date('2026-09-26T05:00:00.000Z'),
    )
    expect(manifest.key).toBe('backups/daily-manifests/2026-09-26.json')
    expect(createHash('sha256').update(manifest.body).digest('hex')).toBe(manifest.sha256)
    const parsed = JSON.parse(new TextDecoder().decode(manifest.body))
    expect(parsed).toMatchObject({
      version: 1,
      environment: 'production',
      date: target.date,
      timeZone: 'Asia/Hong_Kong',
      database,
      controlState,
      assets,
    })
    expect(new TextDecoder().decode(manifest.body)).not.toMatch(
      /secret|password|connectionString|cookie/i,
    )
  })
})
