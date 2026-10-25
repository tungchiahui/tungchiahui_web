import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import {
  bindPgBouncerImage,
  pgbouncerReleaseImageSchema,
} from '../../src/host-release/pgbouncer-image'

const [reference, sha] = z.tuple([z.string(), z.string()]).parse(process.argv.slice(2))
const manifest = pgbouncerReleaseImageSchema.parse({ image: reference, sha })
const path = resolve('ops/production/compose.yaml')
writeFileSync(path, bindPgBouncerImage(readFileSync(path, 'utf8'), reference))
writeFileSync(resolve('ops/production/pgbouncer-image.json'), JSON.stringify(manifest))
