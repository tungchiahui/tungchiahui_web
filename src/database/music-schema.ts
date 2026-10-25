import { integer, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'
import type { LibraryTrack, MusicCheck, MusicImport } from '../music/library-contracts'

export const musicSchema = pgSchema('music')
export const musicTracks = musicSchema.table('tracks', {
  id: text().primaryKey(),
  revision: integer().notNull().default(0),
  payload: jsonb().$type<LibraryTrack>().notNull(),
})
export const musicChecks = musicSchema.table('checks', {
  key: text().primaryKey(),
  payload: jsonb().$type<MusicCheck>().notNull(),
})
export const musicImports = musicSchema.table('imports', {
  id: text().primaryKey(),
  payload: jsonb().$type<MusicImport>().notNull(),
})
