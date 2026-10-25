import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { createDatabaseClient } from '../../src/database/client'
import { type MusicImport, musicFileName } from '../../src/music/library-contracts'
import { MusicLibraryRepository, MusicRevisionConflict } from '../../src/music/library-repository'
import { uploadMusicAudio } from '../../src/music/upload'
import type { ObjectStorage } from '../../src/storage/contracts'

export async function verifyMusicLibrary(databaseUrl: string, storage: ObjectStorage) {
  const repository = new MusicLibraryRepository(databaseUrl)
  const reader = new MusicLibraryRepository(databaseUrl, 'site_app')
  const client = createDatabaseClient({
    connectionString: databaseUrl,
    applicationName: 'music-permission-validation',
    maxConnections: 1,
  })
  try {
    if ((await reader.tracks()).length !== 25)
      throw new Error('Legacy music seed did not preserve all 25 songs')
    for (const role of ['site_app', 'site_content_worker']) {
      let denied = false
      try {
        await client.database.transaction(async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`))
          await tx.execute(sql`SELECT * FROM music.imports`)
        })
      } catch {
        denied = true
      }
      if (!denied) throw new Error('Private music imports exposed to another role')
    }
    const song = {
      id: 'integrationMusic',
      title: '集成测试曲',
      artist: '测试歌手',
      url: 'https://music.3e0.cn/?server=tencent&type=url&id=integrationMusic',
      cover: '',
      lyricSource: '',
      selfHosted: false,
    }
    await repository.sync([song])
    await repository.sync([song])
    const original = (await repository.tracks()).find((t) => t.id === 'tencent:integrationMusic')
    if (original?.revision !== 0) throw new Error('Music sync is not idempotent')
    const bytes = readFileSync('tests/fixtures/music/test-tone.mp3')
    const task: MusicImport = {
      id: randomUUID(),
      trackId: original.id,
      title: original.title,
      artist: original.artist,
      fileName: musicFileName(original.title, original.artist),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      duration: 1,
      expectedRevision: original.revision,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    await repository.prepare(task)
    await repository.prepare(task)
    const stale = { ...task, id: randomUUID() }
    await repository.prepare(stale)
    const url = await uploadMusicAudio(storage, new URL('https://cdn.tungchiahui.cn'), task, bytes)
    await repository.complete(task, url.toString())
    await repository.complete(task, url.toString())
    let conflict = false
    try {
      await repository.complete(stale, url.toString())
    } catch (error: unknown) {
      if (error instanceof MusicRevisionConflict) conflict = true
      else throw error
    }
    if (!conflict) throw new Error('Concurrent music import overwrote the active source')
    await repository.sync([song])
    const published = (await reader.tracks()).find((t) => t.id === original.id)
    if (
      !published?.selfHosted ||
      published.url !== url.toString() ||
      published.sha256 !== task.sha256
    )
      throw new Error('Playlist refresh lost the published music source')
    const restored = await storage.getObject(`music/${task.sha256}/${task.fileName}`)
    let total = 0
    for await (const part of restored.body) total += part.length
    if (total !== bytes.length) throw new Error('Music S3 round trip changed the audio')
    console.log(
      'Music library: PASS (seed, role isolation, idempotency, S3 upload, publication, CAS conflict, refresh preservation)',
    )
  } finally {
    await Promise.all([repository.close(), reader.close(), client.close()])
  }
}
