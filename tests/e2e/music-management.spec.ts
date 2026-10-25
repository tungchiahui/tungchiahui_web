import { expect, test } from '@playwright/test'
import { musicLibrarySchema } from '../../src/music/library-contracts'

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
  await page.getByRole('button', { name: '导出 CSV' }).click()
  expect((await downloaded).suggestedFilename()).toBe('music-library.csv')
  await page.getByRole('button', { name: '补充／替换音源' }).click()
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
  const unauthorized = await page.request.post('/api/ops/music/check', {
    headers: { origin: 'https://evil.example' },
    data: { id: song?.id, source: 'effective' },
  })
  expect(unauthorized.status()).toBe(403)
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect((await page.request.delete('/api/ops/auth/session', { headers: { origin } })).ok()).toBe(
    true,
  )
  expect((await page.request.get('/api/ops/music/library')).status()).toBe(403)
})
