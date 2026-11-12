import { ownerDatasetKeySchema } from '@/domain/persistence'
import { apiSecurityHeaders } from '@/observability/security'
import { emitTelemetry } from '@/observability/telemetry'
import { getPublicContentRepository } from '@/server/public-content'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ dataset: string }> }) {
  const parsed = ownerDatasetKeySchema.safeParse((await context.params).dataset)
  if (!parsed.success)
    return Response.json({ error: 'not_found' }, { status: 404, headers: apiSecurityHeaders })
  if (parsed.data === 'weight_loss')
    return Response.json(
      { error: 'owner_required' },
      { status: 403, headers: { ...apiSecurityHeaders, 'cache-control': 'private, no-store' } },
    )
  try {
    const dataset = await getPublicContentRepository().readOwnerDataset(parsed.data)
    return Response.json({ dataset: dataset ?? null }, { headers: apiSecurityHeaders })
  } catch {
    emitTelemetry({
      component: 'nextjs',
      event: 'owner_dataset_read_failed',
      level: 'error',
      attributes: { dataset: parsed.data },
    })
    return Response.json(
      { error: 'dataset_unavailable' },
      { status: 503, headers: apiSecurityHeaders },
    )
  }
}
