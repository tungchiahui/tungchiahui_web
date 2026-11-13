import { randomUUID } from 'node:crypto'
import { healthExchangeSchema, healthSnapshotSchema } from '../../src/health/contracts'
import { normalizeSmartscaleRow } from '../../src/health/smartscale'
import { expect, test } from './fixtures'

test('Owner manages partial measurements and versioned JSON with private anonymous rendering', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120000)
  if (!baseURL) throw new Error('Missing test base URL')
  await page.goto('/weight-loss')
  await expect(
    page.getByText('登录 Owner 账号后可查看身体指标、历史记录和手动管理功能。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('用户名').fill('owner')
  await dialog.getByLabel('密码').fill('local-only-owner-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  const note = `synthetic-private-${Date.now()}`
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: '保存记录', exact: true }) })
  await form.getByLabel('时间精度').selectOption('date')
  await form.getByLabel('测量时间').fill('2026-10-29')
  await form.getByLabel('腰围 (cm)', { exact: true }).fill('90.5')
  await form.getByLabel('备注', { exact: true }).fill(note)
  await form.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(page.getByRole('cell', { name: note, exact: true })).toBeVisible()
  const snapshot = healthSnapshotSchema.parse(
    await (await page.request.get('/api/ops/health/snapshot')).json(),
  )
  const record = snapshot.measurements.find((row) => row.note === note)
  expect(record).toMatchObject({
    weight: null,
    waist: 90.5,
    timePrecision: 'date',
    measuredAt: '2026-10-28T16:00:00.000Z',
  })
  if (!record) throw new Error('missing synthetic record')
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: note, exact: true }) })
  await row.getByRole('button').click()
  await expect(form.getByLabel('腰围 (cm)', { exact: true })).toHaveValue('90.5')
  await form.getByLabel('腰围 (cm)', { exact: true }).fill('91.5')
  await form.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(form.getByLabel('腰围 (cm)', { exact: true })).toHaveValue('')
  const edited = healthSnapshotSchema
    .parse(await (await page.request.get('/api/ops/health/snapshot')).json())
    .measurements.find((item) => item.id === record.id)
  expect(edited?.waist).toBe(91.5)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click()
  const downloaded = await download
  expect(downloaded.suggestedFilename()).toBe('body-measurements.json')
  const downloadedPath = await downloaded.path()
  if (!downloadedPath) throw new Error('Missing health JSON download')
  await page.locator('input[type="file"]').setInputFiles(downloadedPath)
  await expect(page.getByText(/新增 0 条，更新 0 条/)).toBeVisible()
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认导入', exact: true })).toHaveCount(0)
  const raw = {
    Date: '2026-11-12T08:30:00+08:00',
    Source: 'synthetic-e2e-device',
    User: 'synthetic-e2e-owner',
    Weight: 101,
    BMI: 29,
    BodyFat: 25,
    BodyWater: 50,
    MuscleMass: 50,
    ProteinMass: 12,
  }
  const automatic = {
    ...normalizeSmartscaleRow(raw),
    id: randomUUID(),
    source: 'smartscale',
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const automaticFile = healthExchangeSchema.parse({
    format: 'tungchiahui-health',
    schemaVersion: 1,
    timeZone: 'Asia/Shanghai',
    exportedAt: new Date().toISOString(),
    measurements: [automatic],
    planOverrides: [],
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-s400.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(automaticFile)),
  })
  await expect(page.getByText(/新增 1 条/)).toBeVisible()
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认导入', exact: true })).toHaveCount(0)
  const autoRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'S400 自动同步', exact: true }) })
  await autoRow.getByRole('button').click()
  await expect(form.getByLabel('体重 (kg)', { exact: true })).toBeDisabled()
  await expect(form.getByRole('button', { name: '删除记录', exact: true })).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('health-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: test.info().outputPath('health-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await form.getByLabel('备注', { exact: true }).fill('synthetic automatic annotation')
  await form.getByLabel('排除统计', { exact: true }).check()
  await form.getByRole('button', { name: '保存记录', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: 'synthetic automatic annotation', exact: true }),
  ).toBeVisible()
  expect((await page.request.get('/api/ops/health/snapshot')).headers()['cache-control']).toBe(
    'private, no-store',
  )
  const context = await browser.newContext({ baseURL })
  try {
    const anonymous = await context.newPage()
    await anonymous.goto('/weight-loss')
    expect(await anonymous.content()).not.toContain(note)
    expect(await (await anonymous.request.get('/weight-loss')).text()).not.toContain(note)
    expect((await anonymous.request.get('/api/ops/health/snapshot')).status()).toBe(401)
    expect((await anonymous.request.get('/api/personal-data/weight_loss')).status()).toBe(403)
  } finally {
    await context.close()
  }
  await row.getByRole('button').click()
  page.once('dialog', (confirmation) => confirmation.accept())
  await form.getByRole('button', { name: '删除记录', exact: true }).click()
  await expect(page.getByRole('cell', { name: note, exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'owner', exact: true }).click()
  await expect(
    page.getByText('登录 Owner 账号后可查看身体指标、历史记录和手动管理功能。'),
  ).toBeVisible()
})
