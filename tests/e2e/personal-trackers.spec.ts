import { expect, test } from '@playwright/test'
import { z } from 'zod'
import {
  datasetResponseSchema,
  techFootprintPayloadSchema,
  weightLossPayloadSchema,
} from '../../src/personal/contracts'

test('owner login directly enables both trackers; saves survive reload and remain public', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  if (!baseURL) throw new Error('Missing test base URL')
  const origin = new URL(baseURL).origin
  await page.goto('/tech-footprint')
  await expect(page.getByRole('heading', { name: '机器人系统软件研究生成长路线' })).toBeVisible()
  await expect(page.getByRole('button', { name: '研三下', exact: true })).toBeVisible()
  const progress = page.getByRole('spinbutton').first()
  await expect(progress).toBeDisabled()
  expect(
    (
      await page.request.put('/api/ops/owner/datasets/tech_footprint', {
        headers: { origin },
        data: { expectedRevision: 0, payload: { version: 2, records: {} } },
      })
    ).status(),
  ).toBe(401)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByLabel('站主密码').fill('local-only-owner-password')
  await page.getByRole('dialog').getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(progress).toBeEnabled()
  const cookie = (await page.context().cookies()).find((item) => item.name === 'site_owner_session')
  expect(cookie?.httpOnly).toBe(true)
  expect(cookie?.sameSite).toBe('Strict')
  expect(cookie?.path).toBe('/api/ops/owner')
  await progress.fill('45')
  await page
    .getByRole('textbox', { name: /记录 \/ 下一步/ })
    .first()
    .fill('Tracker E2E persistence')
  await expect(page.getByTestId('save-state')).toContainText('已载入公开记录', { timeout: 15_000 })
  await page.reload()
  await expect(page.getByRole('spinbutton').first()).toHaveValue('45')
  await expect(page.getByRole('spinbutton').first()).toBeEnabled()
  await expect(page.getByRole('textbox', { name: /记录 \/ 下一步/ }).first()).toHaveValue(
    'Tracker E2E persistence',
  )

  const read = await page.request.get('/api/personal-data/tech_footprint')
  expect(read.headers()['cache-control']).toBe('no-store')
  const snapshot = datasetResponseSchema(techFootprintPayloadSchema).parse(
    await read.json(),
  ).dataset
  if (!snapshot) throw new Error('Missing dataset')
  const put = (expectedRevision: number) =>
    page.request.put('/api/ops/owner/datasets/tech_footprint', {
      headers: { origin },
      data: { ...snapshot, expectedRevision },
    })
  // The browser endpoint accepts only the expectedRevision/payload contract.
  expect((await put(snapshot.revision)).status()).toBe(400)
  const validBody = { payload: snapshot.payload, expectedRevision: snapshot.revision }
  expect(
    (
      await page.request.put('/api/ops/owner/datasets/tech_footprint', {
        headers: { origin },
        data: validBody,
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await page.request.put('/api/ops/owner/datasets/tech_footprint', {
        headers: { origin },
        data: validBody,
      })
    ).status(),
  ).toBe(409)
  await page.getByRole('spinbutton').first().fill('55')
  await expect(page.getByTestId('save-state')).toContainText('其他设备已更新', { timeout: 15_000 })
  await expect(page.getByRole('spinbutton').first()).toHaveValue('55')
  await expect(page.getByRole('button', { name: '导出当前草稿' })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '重新载入公开记录' }).click()
  await expect(page.getByRole('spinbutton').first()).toHaveValue('45')

  await page.goto('/weight-loss')
  await expect(page.getByRole('heading', { name: '减脂计划与进度记录' })).toBeVisible()
  const weight = page.getByRole('spinbutton', { name: '7 日平均体重 (kg)' })
  await expect(weight).toBeEnabled()
  await weight.fill('96.5')
  await page.getByRole('spinbutton', { name: '体脂率 (%)' }).fill('26.4')
  await page.getByRole('textbox', { name: '备注', exact: true }).fill('Weekly measurement')
  await expect(page.getByTestId('save-state')).toContainText('已载入公开记录', { timeout: 15_000 })
  const weights = datasetResponseSchema(weightLossPayloadSchema).parse(
    await (await page.request.get('/api/personal-data/weight_loss')).json(),
  ).dataset
  expect(weights?.payload.records[0]).toMatchObject({
    weight: '96.5',
    bodyFat: '26.4',
    note: 'Weekly measurement',
  })
  await page.reload()
  await expect(weight).toHaveValue('96.5')
  await expect(page.getByRole('img', { name: '目标与实际趋势' })).toBeVisible()
  expect(
    (
      await page.request.put('/api/ops/owner/datasets/weight_loss', {
        headers: { origin: 'https://attacker.example' },
        data: {},
      })
    ).status(),
  ).toBe(403)
  expect((await page.request.get('/api/ops/status')).status()).toBe(401)
  expect(
    (
      await page.request.post('/api/ops/owner/deployments', { headers: { origin }, data: {} })
    ).status(),
  ).toBe(404)

  const visitor = await browser.newContext({ baseURL })
  try {
    const publicPage = await visitor.newPage()
    await publicPage.goto('/weight-loss')
    await expect(publicPage.getByRole('spinbutton', { name: '7 日平均体重 (kg)' })).toHaveValue(
      '96.5',
    )
    await expect(publicPage.getByRole('spinbutton', { name: '7 日平均体重 (kg)' })).toBeDisabled()
    await publicPage.setViewportSize({ width: 390, height: 844 })
    for (const route of [
      '/weight-loss',
      '/tech-footprint',
      '/zh-hk/tech-footprint',
      '/zh-tw/weight-loss',
      '/en-us/weight-loss',
    ]) {
      await publicPage.goto(route)
      await expect(publicPage.locator('h1')).toBeVisible()
      expect(
        await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    }
    await expect(publicPage.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  } finally {
    await visitor.close()
  }
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(weight).toBeDisabled()
  expect(
    z
      .object({ authenticated: z.boolean() })
      .parse(await (await page.request.get('/api/ops/owner/session')).json()).authenticated,
  ).toBe(false)
  const replayHeaders = { origin, cookie: `site_owner_session=${cookie?.value ?? ''}` }
  expect(
    (
      await page.request.put('/api/ops/owner/datasets/weight_loss', {
        headers: replayHeaders,
        data: { expectedRevision: weights?.revision, payload: weights?.payload },
      })
    ).status(),
  ).toBe(401)
})
