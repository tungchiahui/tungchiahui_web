import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { type MusicCheck, musicLibrarySchema } from '../../src/music/library-contracts'

import { playbackEvidenceSchema, playbackVerdict } from '../../src/music/playback-check'

test('music management requires an owner and publishes matched MP3 files without editing code', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000)
  if (!baseURL) throw new Error('missing_base')
  const origin = new URL(baseURL).origin
  await page.goto('/music/manage')
  await expect(page.getByText('请使用页面顶部的登录入口登录站主账号。')).toBeVisible()
  expect((await page.request.get('/api/ops/music/library')).status()).toBe(403)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('用户名').fill('owner')
  await dialog.getByLabel('密码').fill('local-only-owner-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.locator('.music-floating')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '复制歌曲 ID' }).first()).toBeVisible()
  await page
    .getByRole('textbox', { name: '搜索歌名、歌手、歌曲 ID 或文件名' })
    .fill('tencent:integrationMusic')
  await expect(page.getByRole('row').filter({ hasText: 'tencent:integrationMusic' })).toHaveCount(1)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出 CSV' }).click()
  expect((await downloaded).suggestedFilename()).toBe('music-library.csv')
  await page.getByRole('button', { name: '更多', exact: true }).click()
  await page.getByRole('menuitem', { name: '补充／替换音源' }).click()
  await page.getByLabel('选择 MP3 文件').setInputFiles('tests/fixtures/music/test-tone-e2e.mp3')
  await expect(page.getByRole('combobox', { name: /为 .* 选择歌曲/ })).toHaveValue(
    'tencent:integrationMusic',
  )
  await expect(page.getByText('集成测试曲-测试歌手.mp3', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '确认并批量上传' }).click()
  await expect(page.getByRole('status')).toContainText('文件已上传并发布', { timeout: 30_000 })
  const stored = musicLibrarySchema.parse(
    await (await page.request.get('/api/ops/music/library')).json(),
  )
  const song = stored.tracks.find((t) => t.id === 'tencent:integrationMusic')
  expect(song?.fileName).toBe('集成测试曲-测试歌手.mp3')
  expect(song?.selfHosted).toBe(true)
  expect(song?.sha256).toMatch(/^[a-f0-9]{64}$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '歌单检测', exact: true }).click()
  const playbackRequest = page.waitForRequest((request) =>
    request.url().endsWith('/api/ops/music/check/browser'),
  )
  await page.getByRole('button', { name: '开始检测 1 首', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('检测完成', { timeout: 45000 })
  const evidence = (await playbackRequest).postDataJSON().playback
  expect(evidence, JSON.stringify(evidence)).toMatchObject({
    outcome: 'played',
    samples: expect.any(Array),
  })
  await expect(page.getByText('播放抽检通过', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止检测' })).toHaveCount(0)
  await page.getByRole('button', { name: '上传记录', exact: true }).click()
  await expect(page.getByText('最近上传记录', { exact: true })).toBeVisible()
  await expect(page.getByLabel('选择 MP3 文件')).toHaveCount(0)
  await page.getByRole('button', { name: '音乐库', exact: true }).click()

  const unauthorized = await page.request.post('/api/ops/music/check', {
    headers: { origin: 'https://evil.example' },
    data: { id: song?.id, source: 'effective' },
  })
  expect(unauthorized.status()).toBe(403)
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '复制歌曲 ID' }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect((await page.request.delete('/api/ops/auth/session', { headers: { origin } })).ok()).toBe(
    true,
  )
  expect((await page.request.get('/api/ops/music/library')).status()).toBe(403)
})

test('music checks filter and preview the selected source and stop only an active scan', async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error('missing_base')
  const stamp = '2026-10-26T00:00:00.000Z'
  const tracks = ['a', 'b'].map((id) => ({
    id: `tencent:${id}`,
    title: `Song ${id}`,
    artist: 'Artist',
    cover: '',
    lyricSource: '',
    selfHosted: true,
    fileName: `${id}-Artist.mp3`,
    bytes: null,
    sha256: null,
    duration: 200,
    revision: 0,
    updatedAt: stamp,
    url: `${baseURL}/current-${id}.mp3`,
    upstreamUrl: `${baseURL}/meting-${id}.mp3`,
  }))
  const checks = [
    { id: 'tencent:a', source: 'effective', status: 'reachable', reason: 'browser_decode' },
    { id: 'tencent:a', source: 'meting', status: 'preview', reason: 'short_duration' },
    { id: 'tencent:b', source: 'effective', status: 'failed', reason: 'not_audio' },
    { id: 'tencent:b', source: 'meting', status: 'reachable', reason: 'browser_decode' },
  ].map((check) => ({ ...check, urlHash: 'a'.repeat(64), checkedAt: stamp }))
  await page.route('**/api/ops/music/library', (route) =>
    route.fulfill({ json: { tracks, checks, imports: [] } }),
  )
  let release: (() => void) | undefined
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/ops/music/check', async (route) => {
    await hold
    await route.fulfill({ json: { check: checks[1] } }).catch(() => {})
  })
  let browserReports = 0
  await page.route('**/api/ops/music/check/browser', (route) => {
    browserReports++
    return route.abort()
  })
  await page.goto('/music/manage')
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: '歌单检测', exact: true }).click()
  await page.getByLabel('筛选音乐').selectOption('missing')
  await expect(page.getByText('Song b', { exact: true })).toBeVisible()
  await expect(page.getByText('Song a', { exact: true })).toHaveCount(0)
  await page.getByLabel('音源', { exact: true }).selectOption('meting')
  await expect(page.getByText('Song a', { exact: true })).toBeVisible()
  await expect(page.getByText('Song b', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '试听', exact: true })).toHaveAttribute(
    'href',
    `${baseURL}/current-a.mp3`,
  )
  await expect(page.getByRole('row').filter({ hasText: 'Song a' })).toContainText('自有 CDN')
  await expect(page.getByText('当前只排查 Meting 原始接口', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '补充音源', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '更多', exact: true }).click()
  await expect(
    page.getByRole('menuitem', { name: '试听 Meting 原始接口', exact: true }),
  ).toHaveAttribute('href', `${baseURL}/meting-a.mp3`)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '停止检测' })).toHaveCount(0)
  const started = page.waitForRequest((request) => request.url().endsWith('/api/ops/music/check'))
  try {
    await page.getByRole('button', { name: '开始检测 1 首', exact: true }).click()
    expect((await started).postDataJSON()).toEqual({ id: 'tencent:a', source: 'meting' })
    await page.getByRole('button', { name: '停止检测' }).click()
    await expect(page.getByRole('status')).toContainText('检测已停止')
    await expect(page.getByRole('button', { name: '停止检测' })).toHaveCount(0)
    expect(browserReports).toBe(0)
  } finally {
    release?.()
  }
  await page.getByLabel('筛选音乐').selectOption('all')
  const firstTrack = tracks[0]
  const metingCheck = checks[1]
  if (!firstTrack || !metingCheck) throw new Error('missing_fixture')
  firstTrack.upstreamUrl = ''
  metingCheck.status = 'uncertain'
  metingCheck.reason = 'unsupported_url'
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: '歌单检测', exact: true }).click()
  await page.getByLabel('音源', { exact: true }).selectOption('meting')
  await page.getByRole('textbox', { name: '搜索歌名、歌手、歌曲 ID 或文件名' }).fill('tencent:a')
  await page.getByRole('button', { name: '开始检测 1 首', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('原始接口检测完成')
  await expect(
    page.getByText('音源地址缺失或暂不支持检测，请先更新 QQ 歌单', { exact: false }),
  ).toBeVisible()
  expect(browserReports).toBe(0)
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('CDN checks run first and repeated empty Meting responses pause the provider without failing every song', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60000)
  if (!baseURL) throw new Error('missing_base')
  const tracks = ['a', 'b', 'c', 'd', 'cdn'].map((id) => ({
    id: `tencent:${id}`,
    title: `Song ${id}`,
    artist: 'Artist',
    cover: '',
    lyricSource: '',
    selfHosted: id === 'cdn',
    fileName: id === 'cdn' ? 'song-artist.mp3' : null,
    bytes: null,
    sha256: null,
    duration: id === 'cdn' ? 1 : null,
    revision: 0,
    updatedAt: '2026-10-26T00:00:00.000Z',
    url:
      id === 'cdn'
        ? `${baseURL}/music-probe-pass.mp3`
        : `https://music.3e0.cn/?server=tencent&type=url&id=${id}`,
    upstreamUrl: `https://music.3e0.cn/?server=tencent&type=url&id=${id}`,
  }))
  const checks: MusicCheck[] = []
  const inspected: string[] = []
  const makeCheck = (id: string, source: MusicCheck['source']): MusicCheck => ({
    id,
    source,
    status: 'uncertain',
    reason: id === 'tencent:cdn' ? 'audio_response' : 'not_audio',
    urlHash: 'a'.repeat(64),
    checkedAt: new Date().toISOString(),
  })
  await page.route('**/api/ops/music/library', (route) =>
    route.fulfill({ json: { tracks, checks, imports: [] } }),
  )
  await page.route('**/api/ops/music/check', async (route) => {
    const { id, source } = z
      .object({ id: z.string(), source: z.enum(['effective', 'meting']) })
      .parse(route.request().postDataJSON())
    inspected.push(id)
    await route.fulfill({ json: { check: makeCheck(id, source) } })
  })
  await page.route('**/api/ops/music/check/browser', async (route) => {
    const report = z
      .object({
        id: z.string(),
        source: z.enum(['effective', 'meting']),
        playback: playbackEvidenceSchema,
      })
      .parse(route.request().postDataJSON())
    const track = tracks.find((song) => song.id === report.id)
    if (!track) throw new Error('missing_track')
    const check = {
      ...makeCheck(report.id, report.source),
      ...playbackVerdict(track, report.playback, track.url),
    }
    checks.push(check)
    await route.fulfill({ json: { check } })
  })
  await page.route('https://music.3e0.cn/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '' }),
  )
  await page.route('**/music-probe-pass.mp3', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: readFileSync('tests/fixtures/music/test-tone-e2e.mp3'),
    }),
  )
  await page.goto('/music/manage')
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: '歌单检测', exact: true }).click()
  await page.getByRole('button', { name: '开始检测 5 首', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已暂停该接口检测', { timeout: 30000 })
  expect(inspected).toEqual(['tencent:cdn', 'tencent:a', 'tencent:b', 'tencent:c'])
  expect(checks.filter((check) => check.status === 'failed')).toHaveLength(0)
  expect(checks.find((check) => check.id === 'tencent:cdn')?.status).toBe('reachable')
  await expect(page.getByRole('row').filter({ hasText: 'Song d' })).toContainText('尚未检测')
  await expect(page.getByRole('row').filter({ hasText: 'Song a' })).toContainText('上游未返回音频')
  await page.getByRole('button', { name: '自有 CDN：1 首', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Song cdn' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Song a' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '音乐库', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
