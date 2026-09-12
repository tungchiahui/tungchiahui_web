import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const ownerPasswordHashSchema = z.string().regex(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/)
export const localOwnerPasswordHash =
  'scrypt:b181f43eb1eedf709e67da05ab362eaf:1243037a7c04c904d5485b228fe58f324303caf504511194999a096e4cd318d84798db45285a9e5110e50099701e971443108f0bdbd3ac46fa81cd0713ef899a'

async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 67108864 }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashOwnerPassword(password: string) {
  z.string().min(16).max(256).parse(password)
  const salt = randomBytes(16).toString('hex')
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`
}

export async function verifyOwnerPassword(password: string, hash: string) {
  const [, salt, digest] = ownerPasswordHashSchema.parse(hash).split(':')
  if (!salt || !digest) return false
  const result = await derive(password, salt)
  return timingSafeEqual(result, Buffer.from(digest, 'hex'))
}

export function ownerDigest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
