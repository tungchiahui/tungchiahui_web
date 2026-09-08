import { NextResponse } from 'next/server'
import { normalizeBingBackgrounds } from '@/start/backgrounds'

const bingArchiveUrl = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN'

export async function GET() {
  try {
    const response = await fetch(bingArchiveUrl, {
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`Bing archive returned HTTP ${response.status}`)
    const backgrounds = normalizeBingBackgrounds(await response.json())
    return NextResponse.json(backgrounds, {
      headers: { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch {
    return NextResponse.json(
      { error: 'backgrounds_unavailable' },
      { headers: { 'cache-control': 'no-store' }, status: 503 },
    )
  }
}
