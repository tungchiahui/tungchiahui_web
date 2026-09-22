import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseEnv } from 'node:util'

import { z } from 'zod'

import { validateProductionEnvironmentContents } from './initialize-secrets'

const ageRecipientSchema = z.string().regex(/^age1[0-9a-z]{20,}$/)
type AgeRunner = (arguments_: readonly string[], input?: Buffer) => Buffer

function requireRegularPrivateFile(path: string, label: string) {
  const metadata = lstatSync(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`)
  }
  if ((metadata.mode & 0o077) !== 0) throw new Error(`${label} must not be group/world accessible`)
}

function runAge(arguments_: readonly string[], input?: Buffer) {
  const result = spawnSync('age', arguments_, {
    encoding: null,
    input,
    maxBuffer: 16 * 1_024 * 1_024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) throw new Error(`age is unavailable: ${result.error.message}`)
  if (result.status !== 0) throw new Error('age failed without exposing sensitive diagnostics')
  return result.stdout
}

export function exportProductionConfiguration(
  input: Readonly<{
    envFile: string
    outputFile: string
    recipient: string
  }>,
  ageRunner: AgeRunner = runAge,
) {
  const envFile = resolve(input.envFile)
  const outputFile = resolve(input.outputFile)
  const recipient = ageRecipientSchema.parse(input.recipient)
  if (existsSync(outputFile))
    throw new Error(`Refusing to overwrite encrypted export: ${outputFile}`)
  requireRegularPrivateFile(envFile, 'Production env')
  const contents = readFileSync(envFile)
  validateProductionEnvironmentContents(contents.toString('utf8'))
  const productionRecipient = parseEnv(contents.toString('utf8')).BACKUP_AGE_RECIPIENT
  if (productionRecipient === recipient) {
    throw new Error('Configuration export must use a recovery recipient kept outside production')
  }
  const encrypted = ageRunner(['--encrypt', '--recipient', recipient], contents)
  mkdirSync(dirname(outputFile), { mode: 0o700, recursive: true })
  writeFileSync(outputFile, encrypted, { flag: 'wx', mode: 0o600 })
  return Object.freeze({ envFile, outputFile, status: 'exported' as const })
}

export function restoreProductionConfiguration(
  input: Readonly<{
    identityFile: string
    inputFile: string
    outputFile: string
  }>,
  ageRunner: AgeRunner = runAge,
) {
  const identityFile = resolve(input.identityFile)
  const inputFile = resolve(input.inputFile)
  const outputFile = resolve(input.outputFile)
  if (existsSync(outputFile)) throw new Error(`Refusing to overwrite production env: ${outputFile}`)
  requireRegularPrivateFile(identityFile, 'Recovery identity')
  const encryptedMetadata = lstatSync(inputFile)
  if (!encryptedMetadata.isFile() || encryptedMetadata.isSymbolicLink()) {
    throw new Error('Encrypted configuration export must be a regular non-symlink file')
  }
  const plaintext = ageRunner(['--decrypt', '--identity', identityFile, inputFile])
  validateProductionEnvironmentContents(plaintext.toString('utf8'))
  mkdirSync(dirname(outputFile), { mode: 0o700, recursive: true })
  writeFileSync(outputFile, plaintext, { flag: 'wx', mode: 0o600 })
  return Object.freeze({ inputFile, outputFile, status: 'restored' as const })
}
