import { hashOwnerPassword } from '../../src/control-plane/owner-password'

// Read from stdin, never argv/env; output only a verifier for the encrypted
// control_api_env. Do not log the password or write a plaintext intermediate file.
let password = ''
for await (const chunk of process.stdin) {
  password += String(chunk)
  if (password.length > 258) throw new Error('Owner password exceeds 256 characters')
}
process.stdout.write(`${await hashOwnerPassword(password.replace(/\r?\n$/u, ''))}\n`)
password = ''
