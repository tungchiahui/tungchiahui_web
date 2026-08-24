import { z } from 'zod'

const serviceHealthSchema = z.object({
  mode: z.enum(['local', 'test']),
  service: z.string(),
  status: z.literal('ok'),
})

export async function fetchServiceHealth(url: URL, expectedService: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })

  if (!response.ok) {
    throw new Error(`${expectedService} health returned HTTP ${response.status}`)
  }

  const health = serviceHealthSchema.parse((await response.json()) as unknown)

  if (health.service !== expectedService) {
    throw new Error(`Expected ${expectedService} health, received ${health.service}`)
  }

  return health
}

export async function waitForHttp(url: URL, expectedService: string) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      return await fetchServiceHealth(url, expectedService)
    } catch (error: unknown) {
      if (attempt === 30) {
        throw error
      }

      await new Promise<void>((resolveWait) => {
        setTimeout(resolveWait, 1000)
      })
    }
  }

  throw new Error(`${expectedService} did not become healthy`)
}
