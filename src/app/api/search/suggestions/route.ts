import { z } from 'zod'

const querySchema = z.object({
  engine: z.enum(['baidu', 'google', 'bing']).catch('google'),
  q: z.string().trim().min(1).max(120),
})
const googleResponseSchema = z.tuple([z.string(), z.array(z.string())]).rest(z.unknown())

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return Response.json({ suggestions: [] })
  const endpoint = new URL('https://suggestqueries.google.com/complete/search')
  endpoint.searchParams.set('client', 'chrome')
  endpoint.searchParams.set('q', parsed.data.q)
  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_500),
    })
    if (!response.ok) throw new Error('suggestion provider unavailable')
    const result = googleResponseSchema.parse(await response.json())
    return Response.json(
      { suggestions: result[1].slice(0, 8) },
      { headers: { 'cache-control': 'private, max-age=60' } },
    )
  } catch {
    return Response.json({ suggestions: [] }, { headers: { 'cache-control': 'no-store' } })
  }
}
