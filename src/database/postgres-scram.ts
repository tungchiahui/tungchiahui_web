import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const scramIterations = 4096
const scramVerifierPattern =
  /^SCRAM-SHA-256\$([1-9][0-9]*):([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/
const pgbouncerUserPattern = /^"([a-z][a-z0-9_]{2,62})"\s+"([^"]+)"$/

type ParsedVerifier = Readonly<{
  iterations: number
  salt: Buffer
  serverKey: Buffer
  storedKey: Buffer
}>

function parseCanonicalBase64(label: string, value: string) {
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length === 0 || decoded.toString('base64') !== value) {
    throw new Error(`${label} is not canonical base64`)
  }
  return decoded
}

export function parsePostgresScramVerifier(verifier: string): ParsedVerifier {
  const match = scramVerifierPattern.exec(verifier)
  if (!match) throw new Error('Invalid PostgreSQL SCRAM-SHA-256 verifier')

  const iterations = Number(match[1])
  if (!Number.isSafeInteger(iterations) || iterations < scramIterations) {
    throw new Error('PostgreSQL SCRAM verifier uses an unsafe iteration count')
  }
  const salt = parseCanonicalBase64('PostgreSQL SCRAM salt', match[2] ?? '')
  const storedKey = parseCanonicalBase64('PostgreSQL SCRAM stored key', match[3] ?? '')
  const serverKey = parseCanonicalBase64('PostgreSQL SCRAM server key', match[4] ?? '')
  if (salt.length < 16 || storedKey.length !== 32 || serverKey.length !== 32) {
    throw new Error('PostgreSQL SCRAM verifier has invalid component lengths')
  }
  return Object.freeze({ iterations, salt, serverKey, storedKey })
}

export function createPostgresScramVerifier(password: string, salt = randomBytes(16)) {
  if (password.length === 0) throw new Error('PostgreSQL SCRAM password must not be empty')
  if (salt.length < 16) throw new Error('PostgreSQL SCRAM salt must contain at least 16 bytes')
  const saltedPassword = pbkdf2Sync(password, salt, scramIterations, 32, 'sha256')
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest('base64')
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest('base64')
  return `SCRAM-SHA-256$${String(scramIterations)}:${salt.toString('base64')}$${storedKey}:${serverKey}`
}

export function verifyPostgresScramVerifier(password: string, verifier: string) {
  const parsed = parsePostgresScramVerifier(verifier)
  const saltedPassword = pbkdf2Sync(password, parsed.salt, parsed.iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest()
  return (
    timingSafeEqual(storedKey, parsed.storedKey) && timingSafeEqual(serverKey, parsed.serverKey)
  )
}

export function parsePgbouncerScramUserlist(contents: string) {
  const result = new Map<string, string>()
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.trim().length === 0) continue
    const match = pgbouncerUserPattern.exec(line.trim())
    if (!match) throw new Error(`Invalid PgBouncer userlist entry on line ${String(index + 1)}`)
    const loginName = match[1] ?? ''
    const verifier = match[2] ?? ''
    if (result.has(loginName)) {
      throw new Error(`Duplicate PgBouncer login identity: ${loginName}`)
    }
    parsePostgresScramVerifier(verifier)
    result.set(loginName, verifier)
  }
  if (result.size === 0) throw new Error('PgBouncer userlist must not be empty')
  return result as ReadonlyMap<string, string>
}
