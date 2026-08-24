import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'

import {
  pathsForRevalidation,
  revalidationRequestSchema,
  verifyRevalidationSignature,
} from '@/content/revalidation'
import { contentTypeCacheTag, routeCacheTag } from '@/web/cache-policy'

export const dynamic = 'force-dynamic'

const secretSchema = z.string().min(32)

export async function POST(request: Request) {
  const body = await request.text()
  const secret = secretSchema.safeParse(process.env.SITE_REVALIDATION_SECRET)
  if (
    !secret.success ||
    !verifyRevalidationSignature(
      body,
      secret.data,
      request.headers.get('x-site-revalidation-signature'),
    )
  ) {
    return Response.json(
      { error: 'unauthorized' },
      { headers: { 'cache-control': 'no-store' }, status: 401 },
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(body) as unknown
  } catch {
    return Response.json(
      { error: 'invalid_request' },
      { headers: { 'cache-control': 'no-store' }, status: 400 },
    )
  }
  const parsed = revalidationRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request' },
      { headers: { 'cache-control': 'no-store' }, status: 400 },
    )
  }

  const paths = pathsForRevalidation(parsed.data)
  const contentTypes = new Set<'blog' | 'wiki'>()
  for (const change of parsed.data.changes) {
    revalidateTag(routeCacheTag(change.routePath), { expire: 0 })
    if (change.previousRoutePath) {
      revalidateTag(routeCacheTag(change.previousRoutePath), { expire: 0 })
    }
    contentTypes.add(change.routePath.startsWith('/blog/') ? 'blog' : 'wiki')
  }
  for (const contentType of contentTypes) {
    revalidateTag(contentTypeCacheTag(contentType), { expire: 0 })
  }
  for (const path of paths) revalidatePath(path)

  console.log(
    JSON.stringify({
      event: 'zh_cn_routes_revalidated',
      routeCount: paths.length,
      sourceCommit: parsed.data.sourceCommit,
    }),
  )
  return Response.json(
    { revalidated: paths },
    { headers: { 'cache-control': 'no-store' }, status: 200 },
  )
}
