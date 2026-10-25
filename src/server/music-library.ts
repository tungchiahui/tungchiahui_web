import 'server-only'
import { z } from 'zod'
import { MusicLibraryRepository } from '../music/library-repository'

let repository: MusicLibraryRepository | undefined
export function publicMusicLibrary() {
  repository ??= new MusicLibraryRepository(z.url().parse(process.env.DATABASE_URL), 'site_app')
  return repository
}
