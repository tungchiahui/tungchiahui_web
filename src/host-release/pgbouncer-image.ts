import { z } from 'zod'
import { immutableImageSchema, releaseShaSchema } from './contracts'

export const pgbouncerReleaseImageSchema = z
  .object({
    image: immutableImageSchema,
    sha: releaseShaSchema,
  })
  .strict()

export const pgbouncerImagePlaceholder =
  '$' + '{TUNGCHIAHUI_PGBOUNCER_IMAGE:?patched immutable PgBouncer image is required}'

export function bindPgBouncerImage(source: string, reference: string): string {
  const image = immutableImageSchema.parse(reference)
  if (source.split(pgbouncerImagePlaceholder).length !== 2)
    throw new Error('Release topology must contain exactly one PgBouncer image placeholder')
  return source.replace(pgbouncerImagePlaceholder, image)
}
