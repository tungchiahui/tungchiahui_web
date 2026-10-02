import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { z } from 'zod'
import {
  datasetResponseSchema,
  techFootprintPayloadSchema,
  weightLossPayloadSchema,
} from '../../src/personal/contracts'
import { roadmapExchangeSchema } from '../../src/personal/exchange'

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
  expect([401, 403]).toContain(
    await page.request
      .put('/api/ops/site/datasets/tech_footprint', {
        headers: { origin },
        data: { expectedRevision: 0, payload: { version: 2, records: {} } },
      })
      .then((response) => response.status()),
  )
  const loginButton = page.getByRole('button', { name: '登录', exact: true })
  await expect(loginButton).toBeVisible()
  await expect(loginButton).toBeEnabled()
  await loginButton.click()
  const loginDialog = page.getByRole('dialog')
  await expect(loginDialog).toBeVisible()
  await expect(loginDialog.getByLabel('用户名')).toBeVisible()
  await loginDialog.getByLabel('用户名').fill('owner')
  await loginDialog.getByLabel('密码').fill('local-only-owner-password')
  await loginDialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(loginDialog).not.toBeVisible()
  await expect(progress).toBeEnabled()
  const cookie = (await page.context().cookies()).find((item) => item.name === 'site_session')
  expect(cookie?.httpOnly).toBe(true)
  expect(cookie?.sameSite).toBe('Strict')
  expect(cookie?.path).toBe('/')
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
    page.request.put('/api/ops/site/datasets/tech_footprint', {
      headers: { origin },
      data: { ...snapshot, expectedRevision },
    })
  // The browser endpoint accepts only the expectedRevision/payload contract.
  expect((await put(snapshot.revision)).status()).toBe(400)
  const validBody = { payload: snapshot.payload, expectedRevision: snapshot.revision }
  expect(
    (
      await page.request.put('/api/ops/site/datasets/tech_footprint', {
        headers: { origin },
        data: validBody,
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await page.request.put('/api/ops/site/datasets/tech_footprint', {
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
      await page.request.put('/api/ops/site/datasets/weight_loss', {
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
  const logoutButton = page.getByRole('button', { name: '退出登录', exact: true })
  await expect(logoutButton).toBeVisible()
  await logoutButton.click()
  await expect(weight).toBeDisabled()
  expect(
    z
      .object({ authenticated: z.boolean() })
      .parse(await (await page.request.get('/api/ops/auth/session')).json()).authenticated,
  ).toBe(false)
  const replayHeaders = { origin, cookie: `site_session=${cookie?.value ?? ''}` }
  expect([401, 403]).toContain(
    await page.request
      .put('/api/ops/site/datasets/weight_loss', {
        headers: replayHeaders,
        data: { expectedRevision: weights?.revision, payload: weights?.payload },
      })
      .then((response) => response.status()),
  )
})

test('owner edits the database roadmap on desktop and 390px mobile', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const name = `E2E 阶段 ${Date.now()}`
  await page.goto('/tech-footprint')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const login = page.getByRole('dialog')
  await login.getByLabel('用户名').fill('owner')
  await login.getByLabel('密码').fill('local-only-owner-password')
  await login.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '编辑路线图' }).click()
  await page.getByRole('button', { name: '新增阶段' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('textbox', { name: '中文标题' }).fill(name)
  await page.getByRole('textbox', { name: '英文标题（可选）' }).fill('E2E stage')
  await page.getByRole('button', { name: '保存', exact: true }).last().click()
  const stage = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: new RegExp(`^${name}`) }) })
  await expect(stage).toBeVisible()
  await stage.getByRole('button', { name: '新增任务' }).click()
  await stage.getByRole('textbox', { name: '中文标题' }).fill('E2E 任务')
  await stage.getByRole('button', { name: '保存', exact: true }).last().click()
  await stage.getByRole('button', { name: '新增子任务' }).click()
  await stage.getByRole('textbox', { name: '中文标题' }).fill('E2E 子任务')
  await stage.getByRole('button', { name: '保存', exact: true }).last().click()
  await expect(page.getByTestId('save-state')).toContainText('已载入公开记录', { timeout: 15_000 })
  await page.reload()
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 JSON' }).click()
  const downloaded = await downloading
  const file = await downloaded.path()
  if (!file) throw new Error('Roadmap export is missing')
  const exported = roadmapExchangeSchema(techFootprintPayloadSchema).parse(
    JSON.parse(await readFile(file, 'utf8')) as unknown,
  )
  await page.getByLabel('导入记录').setInputFiles({
    name: 'roadmap.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  })
  const preview = page.getByRole('dialog', { name: '检查导入内容' })
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: '确认导入并保存' }).click()
  await expect(preview).not.toBeVisible()
  await expect(page.getByTestId('save-state')).toContainText('已载入公开记录', { timeout: 15_000 })
  const roundTrip = datasetResponseSchema(techFootprintPayloadSchema).parse(
    await (await page.request.get('/api/personal-data/tech_footprint')).json(),
  ).dataset
  expect(roundTrip?.payload).toEqual(exported.payload)
  const touch = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  try {
    const touchPage = await touch.newPage()
    await touchPage.goto('/tech-footprint')
    await touchPage.getByRole('button', { name: '编辑路线图' }).tap()
    const touchStage = touchPage
      .getByRole('article')
      .filter({ has: touchPage.getByRole('heading', { name: new RegExp(`^${name}`) }) })
    await touchStage.getByRole('button', { name: '归档' }).first().tap()
    await touchPage.getByRole('button', { name: '显示已归档' }).tap()
    await touchStage.getByRole('button', { name: '恢复', exact: true }).first().tap()
    await expect(touchStage).toBeVisible()
    await expect(touchPage.getByTestId('save-state')).toContainText('已载入公开记录', {
      timeout: 15_000,
    })
    await touchStage.scrollIntoViewIfNeeded()
    await touchPage.screenshot({ path: '/tmp/tech-roadmap-mobile-editor.png' })
  } finally {
    await touch.close()
  }
  await page.reload()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '编辑路线图' }).click()
  await expect(stage).toContainText('E2E 子任务')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const created = stage
  await created.getByRole('button', { name: '归档' }).first().click()
  await page.getByRole('button', { name: '显示已归档' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await created.getByRole('button', { name: '永久删除' }).first().click()
  await expect(created).not.toBeVisible()
  await expect(page.getByTestId('save-state')).toContainText('已载入公开记录', { timeout: 15_000 })
  await page.reload()
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
})
