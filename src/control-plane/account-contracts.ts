import { z } from 'zod'

export const publicAccountSchema = z.object({
  username: z.string().min(1),
  role: z.enum(['owner', 'user']),
})

export const accountSessionResponseSchema = z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(true), account: publicAccountSchema }),
  z.object({ authenticated: z.literal(false), account: z.null() }),
])
