import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createDatabaseClient } from '../database/client'
import { musicChecks, musicImports, musicTracks } from '../database/music-schema'
import type { MusicSong } from './contracts'
import {
  libraryTrackSchema,
  type MusicCheck,
  type MusicImport,
  musicCheckSchema,
  musicIdSchema,
  musicImportSchema,
  musicLibrarySchema,
} from './library-contracts'
import { musicSourceHash } from './probe'

export class MusicRevisionConflict extends Error {}

export class MusicLibraryRepository {
  readonly client: ReturnType<typeof createDatabaseClient>
  constructor(
    connectionString: string,
    readonly role: 'site_control_api' | 'site_app' = 'site_control_api',
  ) {
    this.client = createDatabaseClient({
      applicationName: 'music-library',
      connectionString,
      maxConnections: 2,
    })
  }
  close() {
    return this.client.close()
  }
  async tracks() {
    return this.client.database.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${this.role}`))
      const rows = await tx.select().from(musicTracks).orderBy(musicTracks.id)
      return rows.map((row) => libraryTrackSchema.parse({ ...row.payload, revision: row.revision }))
    })
  }
  async library() {
    const tracks = await this.tracks()
    return this.client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      const checks = await tx.select().from(musicChecks)
      const imports = await tx
        .select()
        .from(musicImports)
        .orderBy(desc(sql`${musicImports.payload}->>'createdAt'`))
        .limit(100)
      return musicLibrarySchema.parse({
        tracks,
        checks: checks
          .map((r) => musicCheckSchema.parse(r.payload))
          .filter((check) => {
            const track = tracks.find((item) => item.id === check.id)
            return (
              track &&
              check.urlHash ===
                musicSourceHash(check.source === 'effective' ? track.url : track.upstreamUrl)
            )
          }),
        imports: imports.map((r) => r.payload),
      })
    })
  }
  async sync(songs: readonly MusicSong[]) {
    return this.client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('music-library-sync'))`)
      for (const song of songs) {
        const id = `tencent:${song.id}`
        if (!musicIdSchema.safeParse(id).success || !song.title.trim() || !song.artist.trim())
          continue
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`)
        const current = (await tx.select().from(musicTracks).where(eq(musicTracks.id, id)))[0]
        const old = current ? libraryTrackSchema.parse(current.payload) : undefined
        const payload = libraryTrackSchema.parse({
          ...song,
          id,
          selfHosted: old?.selfHosted ?? false,
          url: old?.selfHosted ? old.url : song.url,
          fileName: old?.fileName ?? null,
          bytes: old?.bytes ?? null,
          sha256: old?.sha256 ?? null,
          duration: old?.duration ?? null,
          upstreamUrl: song.url,
          revision: current?.revision ?? 0,
          updatedAt: new Date().toISOString(),
        })
        if (old && JSON.stringify({ ...payload, updatedAt: old.updatedAt }) === JSON.stringify(old))
          continue
        if (current) payload.revision = current.revision + 1
        await tx
          .insert(musicTracks)
          .values({ id, payload, revision: payload.revision })
          .onConflictDoUpdate({
            target: musicTracks.id,
            set: { payload, revision: payload.revision },
          })
        if (old?.url !== payload.url)
          await tx.delete(musicChecks).where(eq(musicChecks.key, `${id}:effective`))
        if (old?.upstreamUrl !== payload.upstreamUrl)
          await tx.delete(musicChecks).where(eq(musicChecks.key, `${id}:meting`))
      }
    })
  }
  async check(input: MusicCheck) {
    const payload = musicCheckSchema.parse(input)
    await this.client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${payload.id}))`)
      const track = libraryTrackSchema.parse(
        (await tx.select().from(musicTracks).where(eq(musicTracks.id, payload.id)))[0]?.payload,
      )
      if (
        musicSourceHash(payload.source === 'effective' ? track.url : track.upstreamUrl) !==
        payload.urlHash
      )
        throw new MusicRevisionConflict()
      await tx
        .insert(musicChecks)
        .values({ key: `${payload.id}:${payload.source}`, payload })
        .onConflictDoUpdate({ target: musicChecks.key, set: { payload } })
    })
  }
  async prepare(input: MusicImport) {
    const payload = musicImportSchema.parse(input)
    return this.client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${payload.trackId}))`)
      const previous = (
        await tx.select().from(musicImports).where(eq(musicImports.id, payload.id))
      )[0]
      if (previous) {
        const saved = musicImportSchema.parse(previous.payload)
        if (JSON.stringify({ ...saved, status: 'pending' }) !== JSON.stringify(payload))
          throw new MusicRevisionConflict()
        return saved
      }
      const current = (
        await tx.select().from(musicTracks).where(eq(musicTracks.id, payload.trackId))
      )[0]
      if (!current || current.revision !== payload.expectedRevision)
        throw new MusicRevisionConflict()
      const existing = libraryTrackSchema.parse(current.payload)
      const pending = {
        ...payload,
        status:
          existing.sha256 === payload.sha256 &&
          existing.fileName === payload.fileName &&
          existing.title === payload.title &&
          existing.artist === payload.artist
            ? ('completed' as const)
            : ('pending' as const),
      }
      await tx
        .insert(musicImports)
        .values({ id: payload.id, payload: pending })
        .onConflictDoNothing()
      const stored = musicImportSchema.parse(
        (await tx.select().from(musicImports).where(eq(musicImports.id, payload.id)))[0]?.payload,
      )
      if (JSON.stringify({ ...stored, status: 'pending' }) !== JSON.stringify(payload))
        throw new MusicRevisionConflict()
      return stored
    })
  }
  async import(id: string) {
    return this.client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      const row = (
        await tx
          .select()
          .from(musicImports)
          .where(eq(musicImports.id, z.uuid().parse(id)))
      )[0]
      return row ? musicImportSchema.parse(row.payload) : null
    })
  }
  async complete(input: MusicImport, url: string) {
    const completed = await this.client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.trackId}))`)
      const task = musicImportSchema.parse(
        (await tx.select().from(musicImports).where(eq(musicImports.id, input.id)).for('update'))[0]
          ?.payload,
      )
      if (task.status === 'completed') return true
      const row = (
        await tx
          .select()
          .from(musicTracks)
          .where(
            and(
              eq(musicTracks.id, input.trackId),
              eq(musicTracks.revision, input.expectedRevision),
            ),
          )
      )[0]
      if (!row) {
        await tx
          .update(musicImports)
          .set({ payload: { ...task, status: 'conflict' } })
          .where(eq(musicImports.id, input.id))
        return false
      }
      const old = libraryTrackSchema.parse(row.payload)
      const payload = libraryTrackSchema.parse({
        ...old,
        title: input.title,
        artist: input.artist,
        url,
        selfHosted: true,
        fileName: input.fileName,
        bytes: input.bytes,
        sha256: input.sha256,
        duration: input.duration,
        revision: input.expectedRevision + 1,
        updatedAt: new Date().toISOString(),
      })
      await tx
        .update(musicTracks)
        .set({ payload, revision: payload.revision })
        .where(eq(musicTracks.id, input.trackId))
      await tx
        .update(musicImports)
        .set({ payload: { ...task, status: 'completed' } })
        .where(eq(musicImports.id, input.id))
      await tx.delete(musicChecks).where(eq(musicChecks.key, `${input.trackId}:effective`))
      return true
    })
    if (!completed) throw new MusicRevisionConflict()
  }
}
