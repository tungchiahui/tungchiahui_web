import { describe, expect, it } from 'vitest'

import type { ObjectStorage, PutStorageObject, StorageObject } from '../../src/storage/contracts'
import { StorageObjectNotFoundError } from '../../src/storage/contracts'
import { backupAssets } from '../../tools/storage/asset-backup'
import { parseAssetBackupConfiguration } from '../../tools/storage/asset-backup-configuration'

class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, Readonly<{ body: Uint8Array; contentType: string }>>()
  readonly deleted: string[] = []

  constructor(initial: Readonly<Record<string, string>>) {
    for (const [key, value] of Object.entries(initial)) {
      this.objects.set(key, {
        body: new TextEncoder().encode(value),
        contentType: 'text/plain',
      })
    }
  }

  async deleteObject(key: string) {
    this.deleted.push(key)
    this.objects.delete(key)
  }

  async getObject(key: string): Promise<StorageObject> {
    const object = this.objects.get(key)
    if (!object) throw new StorageObjectNotFoundError(key)
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(object.body)
          controller.close()
        },
      }),
      contentLength: object.body.byteLength,
      contentType: object.contentType,
      metadata: {},
    }
  }

  async headObject(key: string) {
    const object = this.objects.get(key)
    if (!object) throw new StorageObjectNotFoundError(key)
    return { contentLength: object.body.byteLength, metadata: {} }
  }

  async listObjects(prefix: string) {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort()
  }

  async putObject(object: PutStorageObject) {
    const body =
      typeof object.body === 'string' ? new TextEncoder().encode(object.body) : object.body
    this.objects.set(object.key, { body, contentType: object.contentType })
    return { metadata: object.metadata ?? {} }
  }
}

class StaleListingStorage extends MemoryStorage {
  override async listObjects(prefix: string) {
    return [...(await super.listObjects(prefix)), 'tungwebsite/listed-but-missing.txt'].sort()
  }
}

describe('asset backup', () => {
  it('parses separate HTTPS source and target identities from SOPS sections', () => {
    const configuration = parseAssetBackupConfiguration({
      backup_env: [
        'BACKUP_OFFSITE_S3_ENDPOINT=https://backup.example.test',
        'BACKUP_OFFSITE_S3_REGION=auto',
        'BACKUP_OFFSITE_S3_BUCKET=backup-bucket',
        'BACKUP_OFFSITE_S3_ACCESS_KEY_ID=backup-key',
        'BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY=backup-secret',
        'BACKUP_OFFSITE_S3_FORCE_PATH_STYLE=false',
      ].join('\n'),
      web_env: [
        'ASSET_S3_ENDPOINT=https://assets.example.test',
        'ASSET_S3_REGION=us-east-1',
        'ASSET_S3_BUCKET=asset-bucket',
        'ASSET_S3_ACCESS_KEY_ID=asset-key',
        'ASSET_S3_SECRET_ACCESS_KEY=asset-secret',
        'ASSET_S3_FORCE_PATH_STYLE=true',
      ].join('\n'),
    })

    expect(configuration.source.bucket).toBe('asset-bucket')
    expect(configuration.target.bucket).toBe('backup-bucket')
    expect(configuration.target.forcePathStyle).toBe(false)
  })

  it('copies missing and changed objects, verifies writes, and preserves target-only objects', async () => {
    const source = new MemoryStorage({
      'backups/database-backups/current/manifest.json': 'encrypted-recovery-manifest',
      'libs/same.txt': 'same',
      'tungwebsite/changed.txt': 'current',
      'tungwebsite/new.txt': 'new',
    })
    const target = new MemoryStorage({
      'backups/control-state/production/latest.json': 'recovery-state',
      'libs/old-only.txt': 'preserved',
      'libs/same.txt': 'same',
      'tungwebsite/changed.txt': 'old',
    })

    const report = await backupAssets(source, target, {
      execute: true,
      now: new Date('2026-09-07T01:00:00.000Z'),
    })

    expect(report).toMatchObject({
      copied: 2,
      listedSourceObjects: 4,
      preservedTargetOnly: 2,
      sourceObjects: 4,
      sourceUnavailable: 0,
      unchanged: 1,
      updated: 1,
      verifiedWrites: 3,
    })
    expect(target.deleted).toEqual([])
    expect(new TextDecoder().decode(target.objects.get('libs/old-only.txt')?.body)).toBe(
      'preserved',
    )
    expect(new TextDecoder().decode(target.objects.get('tungwebsite/changed.txt')?.body)).toBe(
      'current',
    )
    expect(report.manifestKey).toMatch(/^asset-backups\/manifests\//u)
    expect(target.objects.has('asset-backups/latest.json')).toBe(true)
    expect(target.objects.has('backups/database-backups/current/manifest.json')).toBe(true)
    expect(target.objects.has('backups/control-state/production/latest.json')).toBe(true)
  })

  it('reports a dry run without mutating the target', async () => {
    const source = new MemoryStorage({ 'libs/new.txt': 'new' })
    const target = new MemoryStorage({ 'libs/old.txt': 'old' })
    const before = [...target.objects.keys()]

    const report = await backupAssets(source, target, { execute: false })

    expect(report).toMatchObject({ copied: 1, preservedTargetOnly: 1, verifiedWrites: 0 })
    expect([...target.objects.keys()]).toEqual(before)
    expect(target.deleted).toEqual([])
  })

  it('fails closed when the source collides with the target-only manifest namespace', async () => {
    const source = new MemoryStorage({ 'asset-backups/unsafe': 'asset' })
    const target = new MemoryStorage({})

    await expect(backupAssets(source, target, { execute: true })).rejects.toThrow(
      'collides with reserved backup namespace',
    )
    expect(target.objects.size).toBe(0)
  })

  it('repairs an object present in a stale target listing but absent on read', async () => {
    const source = new MemoryStorage({ 'tungwebsite/listed-but-missing.txt': 'current' })
    const target = new StaleListingStorage({})

    const report = await backupAssets(source, target, { execute: true })

    expect(report).toMatchObject({ copied: 1, updated: 0, verifiedWrites: 1 })
    expect(target.objects.has('tungwebsite/listed-but-missing.txt')).toBe(true)
  })

  it('preserves the target copy when a listed source object is unavailable', async () => {
    const source = new StaleListingStorage({ 'libs/current.txt': 'current' })
    const target = new MemoryStorage({ 'tungwebsite/listed-but-missing.txt': 'old-backup' })

    const report = await backupAssets(source, target, { execute: true })

    expect(report).toMatchObject({
      listedSourceObjects: 2,
      preservedTargetOnly: 1,
      sourceObjects: 1,
      sourceUnavailable: 1,
    })
    expect(
      new TextDecoder().decode(target.objects.get('tungwebsite/listed-but-missing.txt')?.body),
    ).toBe('old-backup')
    expect(target.deleted).toEqual([])
  })
})
