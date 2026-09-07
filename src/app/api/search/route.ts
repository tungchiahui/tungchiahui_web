import { z } from 'zod'
import { safeErrorAttributes } from '@/observability/telemetry'
import { readCachedSearch } from '@/search/cache'
import { searchRequestSchema, searchResponseSchema } from '@/search/contracts'

export const dynamic = 'force-dynamic'

const queryParametersSchema = z
  .object({
    type: z.enum(['blog', 'wiki']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    locale: z.enum(['zh-cn', 'zh-hk', 'zh-tw', 'en-us']).default('zh-cn'),
    q: z.string().trim().min(1).max(200),
  })
  .strict()

export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = Object.fromEntries(url.searchParams)
  const parsed = queryParametersSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_search_request' },
      { headers: { 'cache-control': 'no-store' }, status: 400 },
    )
  }
  const searchRequest = searchRequestSchema.parse({
    contentType: parsed.data.type,
    limit: parsed.data.limit,
    locale: parsed.data.locale,
    query: parsed.data.q,
  })
  try {
    const results = await readCachedSearch(searchRequest)
    return Response.json(
      searchResponseSchema.parse({
        locale: searchRequest.locale,
        query: searchRequest.query,
        results,
      }),
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'search_request_failed',
        locale: searchRequest.locale,
        ...safeErrorAttributes(error),
      }),
    )
    return Response.json(
      { error: 'search_unavailable' },
      { headers: { 'cache-control': 'no-store' }, status: 503 },
    )
  }
}
