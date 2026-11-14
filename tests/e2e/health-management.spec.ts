import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { healthExchangeSchema, healthSnapshotSchema } from '../../src/health/contracts'
import { normalizeSmartscaleRow } from '../../src/health/smartscale'
import { expect, test } from './fixtures'

test.use({ hasTouch: true })

test('Owner manages partial measurements and versioned JSON with private anonymous rendering', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120000)
  if (!baseURL) throw new Error('Missing test base URL')
  await page.goto('/weight-loss')
  await expect(
    page.getByText('登录 Owner 账号后可查看个人计划、身体指标和历史记录。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('用户名').fill('owner')
  await dialog.getByLabel('密码').fill('local-only-owner-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '新增手动记录', exact: true }).click()
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
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const edited = healthSnapshotSchema
    .parse(await (await page.request.get('/api/ops/health/snapshot')).json())
    .measurements.find((item) => item.id === record.id)
  expect(edited?.waist).toBe(91.5)
  await page.getByRole('button', { name: '数据管理', exact: true }).click()
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
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.screenshot({ path: test.info().outputPath('health-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: test.info().outputPath('health-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await autoRow.getByRole('button').click()
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
    const html = await (await anonymous.request.get('/weight-loss')).text()
    expect(html).not.toContain(note)
    expect(html).not.toContain('1300-1400 kcal')
    expect(html).not.toContain('2027-01-10')
    await expect(anonymous.getByRole('heading', { name: '阶段计划' })).toHaveCount(0)
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
    page.getByText('登录 Owner 账号后可查看个人计划、身体指标和历史记录。'),
  ).toBeVisible()
})

test('Owner dashboard charts support four locales, keyboard, mobile touch and dark mode', async ({
  page,
}) => {
  test.setTimeout(120000)
  const { emptyMetrics, measurementDay, measurementSchema } = await import(
    '../../src/health/contracts'
  )
  const messagesForLocale = (locale: string) =>
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, `../../messages/${locale}.json`), 'utf8'),
    ) as typeof import('../../messages/zh-cn.json')
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  const measurements = Array.from({ length: 42 }, (_, index) => {
    const daysAgo = index < 20 ? 86 - index : 43 - index
    const measuredAt = new Date(Date.now() - daysAgo * 86400000).toISOString()
    return measurementSchema.parse({
      ...emptyMetrics,
      id: randomUUID(),
      measuredAt,
      timePrecision: 'datetime',
      source: 'manual',
      sourceRecordKey: null,
      rawPayload: null,
      revision: 0,
      excluded: index === 10,
      note: `synthetic-chart-${index}`,
      weight: 96 - index * 0.16 + Math.sin(index) * 0.25,
      bodyFat: index % 3 === 0 ? null : 28 - index * 0.06,
      muscleMass: 55 + Math.sin(index) * 0.2,
      waist: index % 5 === 0 ? 98 - index * 0.12 : null,
      proteinMass: index === 41 ? null : 12 + index * 0.02,
      bodyScore: index === 41 ? null : 80 + Math.floor(index / 10),
      metabolicAge: index >= 40 ? null : 45 - Math.floor(index / 4),
      bmi: 30 - index * 0.05,
      bodyWater: index % 3 === 0 ? null : 52 + index * 0.08,
      visceralFat: 12 - Math.floor(index / 10),
      basalMetabolism: 1800 - index * 2,
      createdAt: measuredAt,
      updatedAt: measuredAt,
    })
  }).toReversed()
  measurements.unshift(
    measurementSchema.parse({
      ...measurements[0],
      id: randomUUID(),
      measuredAt: new Date().toISOString(),
      excluded: true,
      proteinMass: 199,
      bodyScore: 99,
      metabolicAge: 149,
    }),
  )
  let emptySupplementaryMetrics = false
  await page.route('**/api/ops/health/snapshot?*', async (route) => {
    const response = await route.fetch()
    const { ownerHealthSnapshotSchema } = await import('../../src/health/contracts')
    const complete = ownerHealthSnapshotSchema.parse(await response.json())
    await route.fulfill({
      response,
      json: {
        ...complete,
        measurements: emptySupplementaryMetrics
          ? measurements.map((row) => ({ ...row, bodyScore: null, metabolicAge: null }))
          : measurements,
      },
    })
  })
  await page.goto('/weight-loss')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const login = page.getByRole('dialog')
  await login.getByLabel('用户名').fill('owner')
  await login.getByLabel('密码').fill('local-only-owner-password')
  await login.getByRole('button', { name: '登录', exact: true }).click()
  const chart = page.locator('#health-trend')
  const captureChart = async (name: string) => {
    const viewport = page.viewportSize()
    const bounds = await chart.boundingBox()
    if (viewport && bounds)
      await page.setViewportSize({
        width: viewport.width,
        height: Math.max(viewport.height, Math.ceil(bounds.height) + 160),
      })
    await chart.evaluate((element) =>
      element.scrollIntoView({ behavior: 'instant', block: 'start' }),
    )
    await chart.screenshot({ path: test.info().outputPath(name) })
    if (viewport) await page.setViewportSize(viewport)
  }

  await expect(chart.getByRole('img')).toBeVisible()
  await expect(chart.locator('path[data-estimated="true"]')).toHaveCount(2)
  await expect(chart.locator('path[data-estimated="false"]')).toHaveCount(3)
  await expect(chart.getByLabel('聚合方式')).toHaveValue('smooth')
  await expect(chart.getByLabel('平滑范围')).toHaveValue('14')
  await chart.getByLabel('平滑范围').selectOption('30')
  await chart.getByLabel('平滑范围').selectOption('7')
  await chart.getByLabel('平滑范围').selectOption('14')
  await chart.getByLabel('显示实测日均点').uncheck()
  await expect(chart.locator('circle[data-observed]')).toHaveCount(0)
  await chart.getByLabel('显示实测日均点').check()
  await expect(chart.locator('circle[data-observed]')).toHaveCount(41)
  const slider = chart.getByRole('slider')
  const last = await slider.inputValue()
  await slider.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(slider).not.toHaveValue(last)
  await captureChart('health-chart-default.png')
  await slider.press('Home')
  for (let day = 0; day < 35; day++) await slider.press('ArrowRight')
  await expect(chart.getByTestId('chart-reading')).toContainText('缺测估算')
  await expect(slider).toHaveAttribute('aria-valuetext', /缺测估算/)
  await captureChart('health-chart-gap-estimate.png')
  await slider.press('End')
  await chart.getByLabel('显示完整计划').check()
  await expect(chart.locator('polyline')).toHaveCount(1)
  await chart.getByLabel('聚合方式').selectOption('rolling')
  await expect(chart.locator('path[data-estimated="true"]')).toHaveCount(2)
  await expect(chart.locator('path[data-estimated="false"]')).toHaveCount(3)
  await chart.getByLabel('聚合方式').selectOption('raw')
  await expect(chart.locator('circle[data-observed]')).toHaveCount(41)
  await chart.getByLabel('聚合方式').selectOption('smooth')
  await page.getByRole('button', { name: '按月', exact: true }).click()
  await expect(page.getByRole('button', { name: '按月', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.screenshot({
    path: test.info().outputPath('health-dashboard-desktop.png'),
    fullPage: true,
  })
  for (const locale of ['zh-cn', 'zh-hk', 'zh-tw', 'en-us'] as const) {
    await page.goto(locale === 'zh-cn' ? '/weight-loss' : `/${locale}/weight-loss`)
    const copy = messagesForLocale(locale).Health
    const overview = page.getByRole('region', { name: copy.overview, exact: true })
    await expect(overview.getByRole('article')).toHaveCount(10)
    await expect(
      overview.getByRole('heading', { name: copy.metrics.waist, exact: true }),
    ).toHaveCount(0)
    for (const metric of [
      'weight',
      'bodyFat',
      'muscleMass',
      'proteinMass',
      'bmi',
      'bodyWater',
      'visceralFat',
      'basalMetabolism',
    ] as const) {
      const card = overview.getByRole('article').filter({
        has: page.getByRole('heading', { name: copy.metrics[metric], exact: true }),
      })
      await expect(card).toBeVisible()
      await expect(card).not.toContainText(copy.noData)
      expect(await card.locator('svg[viewBox="0 0 160 36"]').innerHTML()).not.toMatch(
        /NaN|Infinity/,
      )
    }
    for (const metric of ['proteinMass', 'bodyScore', 'metabolicAge'] as const) {
      const card = overview.getByRole('article').filter({
        has: page.getByRole('heading', { name: copy.metrics[metric], exact: true }),
      })
      const latest = measurements.find((row) => !row.excluded && row[metric] !== null)
      expect(latest).toBeDefined()
      await expect(card).toContainText(
        new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(latest?.[metric] ?? 0),
      )
      await expect(card).toContainText(measurementDay(latest?.measuredAt ?? ''))
    }
    const score = overview.getByRole('article').filter({ hasText: copy.metrics.bodyScore })
    const age = overview.getByRole('article').filter({ hasText: copy.metrics.metabolicAge })
    await expect(score).toContainText(copy.units.points)
    await expect(age).toContainText(copy.units.years)
    await expect(score.locator('svg')).toHaveCount(0)
    await expect(age.locator('svg')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: copy.stagePlan, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: copy.calendar, exact: true })).toBeVisible()
    await expect(page.locator('#health-trend')).not.toContainText('MISSING_MESSAGE')
    await expect(page.locator('.music-floating, .music-mini')).toHaveCount(0)
    expect(await (await page.request.get(`/${locale}/weight-loss`)).text()).not.toContain(
      '1300-1400 kcal',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.locator('#health-trend svg').tap({ position: { x: 180, y: 100 } })
    await expect(chart.getByTestId('chart-reading')).toContainText(copy.gapEstimate)
    await page.getByRole('button', { name: copy.addRecord, exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(
      await page
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await page.keyboard.press('Escape')
  }
  await page.goto('/weight-loss')
  await expect(page.locator('#health-trend svg')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 2000 })
  const overview = page.getByRole('region', { name: '减重总览', exact: true })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await overview.screenshot({ path: test.info().outputPath('health-overview-mobile.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await captureChart('health-chart-mobile.png')
  await page.screenshot({
    path: test.info().outputPath('health-dashboard-mobile.png'),
    fullPage: true,
  })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({
    path: test.info().outputPath('health-dashboard-mobile-dark.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({
    path: test.info().outputPath('health-dashboard-desktop-dark.png'),
    fullPage: true,
  })
  expect(await chart.locator('svg').innerHTML()).not.toMatch(/NaN|Infinity/)
  emptySupplementaryMetrics = true
  await page.reload()
  for (const name of ['身体评分', '代谢年龄']) {
    const card = overview.getByRole('article').filter({
      has: page.getByRole('heading', { name, exact: true }),
    })
    await expect(card).toContainText('暂无数据')
    await expect(card).toContainText('—')
  }
  expect(failures).toEqual([])
})
