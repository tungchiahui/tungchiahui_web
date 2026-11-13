import { z } from 'zod'

export function selectImageRegistryReference(input: unknown, repository: string) {
  const references = z.array(z.string()).parse(input)
  const reference = references.find((value) => value.startsWith(`${repository}@`))
  const digest = z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .parse(reference?.slice(repository.length + 1))
  return `${repository}@${digest}`
}
