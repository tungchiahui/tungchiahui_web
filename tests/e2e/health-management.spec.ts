import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { healthExchangeSchema, ownerHealthSnapshotSchema } from '../../src/health/contracts'
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
  const snapshot = ownerHealthSnapshotSchema.parse(
    await (await page.request.get('/api/ops/health/snapshot')).json(),
  )
  expect(snapshot.plan.bodyTargets?.baselineDate).toBe('2026-11-26')
  expect(snapshot.plan.bodyTargets?.points).toHaveLength(5)
  expect(snapshot.plan.bodyTargets?.points.at(-1)?.weight).toBe(78.5)
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
  const edited = ownerHealthSnapshotSchema
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
    expect(html).not.toContain('2026-11-30')
    expect(html).not.toContain('2027-01-10')
    expect(html).not.toContain('2027-03-20')
    expect(html).not.toContain('2000-02-04')
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
  const { displayMetricValue } = await import('../../src/health/display-metrics')
  const now = Date.parse('2026-11-17T08:00:00+08:00')
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  const measurements = Array.from({ length: 42 }, (_, index) => {
    const daysAgo = index < 20 ? 86 - index : 43 - index
    const measuredAt = new Date(now - daysAgo * 86400000).toISOString()
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
      measuredAt: new Date(now).toISOString(),
      excluded: true,
      proteinMass: 199,
      bodyScore: 99,
      metabolicAge: 149,
    }),
  )
  let emptySupplementaryMetrics = false
  await page.route('**/api/ops/health/snapshot?*', async (route) => {
    const response = await route.fetch()
    const complete = ownerHealthSnapshotSchema.parse(await response.json())
    await route.fulfill({
      response,
      json: {
        ...complete,
        plan: { ...complete.plan, bodyTargets: undefined },
        measurements: emptySupplementaryMetrics
          ? measurements.map((row) => ({ ...row, bodyScore: null, metabolicAge: null }))
          : measurements,
      },
    })
  })
  await page.goto('/weight-loss')
  await expect(
    page.getByText('登录 Owner 账号后可查看个人计划、身体指标和历史记录。'),
  ).toBeVisible()
  await page.clock.setFixedTime(new Date(now))
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
  await expect(chart.getByLabel('时间范围')).toHaveValue('180')
  await expect(chart.getByLabel('平滑范围')).toHaveValue('7')
  await chart.getByLabel('平滑范围').selectOption('30')
  await chart.getByLabel('平滑范围').selectOption('14')
  await chart.getByLabel('平滑范围').selectOption('7')
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
  await expect(chart.getByTestId('chart-reading')).toContainText(
    measurementDay(new Date(now - 179 * 86400000).toISOString()),
  )
  await chart.getByLabel('时间范围').selectOption('90')
  await slider.press('Home')
  for (let day = 0; day < 35; day++) await slider.press('ArrowRight')
  await expect(chart.getByTestId('chart-reading')).toContainText('缺测估算')
  await expect(slider).toHaveAttribute('aria-valuetext', /缺测估算/)
  await captureChart('health-chart-gap-estimate.png')
  await slider.press('End')
  await chart.getByLabel('显示完整计划').check()
  const expandedSvg = chart.getByRole('img')
  expect(
    await expandedSvg.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(500)
  expect(await chart.getByTestId('chart-y-tick').count()).toBeGreaterThanOrEqual(8)
  await slider.press('End')
  await expect(chart.getByTestId('chart-reading')).toContainText('2027-03-20')
  await expect(chart.getByTestId('chart-reading')).toContainText('暂无数据')
  await expect(chart.getByTestId('chart-plan-reading')).toContainText('70 kg')
  await expandedSvg.evaluate((element) =>
    element.scrollIntoView({ behavior: 'instant', block: 'center' }),
  )
  const svgBounds = await expandedSvg.boundingBox()
  if (!svgBounds) throw new Error('Expanded chart bounds missing')
  const targetPoint = await chart.getByTestId('chart-plan-line').evaluate((element) => {
    const point = element.getAttribute('points')?.trim().split(' ').at(-1)?.split(',').map(Number)
    if (point?.length !== 2) throw new Error('Plan endpoint missing')
    return { x: point[0] ?? 0, y: point[1] ?? 0 }
  })
  await page.mouse.move(svgBounds.x + targetPoint.x + 1, svgBounds.y + targetPoint.y)
  await expect(chart.getByTestId('chart-tooltip')).toContainText('2027-03-20')
  await expect(chart.getByTestId('chart-tooltip')).toContainText('计划目标')
  await expect(chart.getByTestId('chart-tooltip')).toContainText('70 kg')
  await expect(chart.locator('circle[class*="text-emerald"]')).toHaveCount(0)
  const observedMarker = expandedSvg.locator('circle[data-observed]').last()
  await expandedSvg.evaluate((element) =>
    element.scrollIntoView({ behavior: 'instant', block: 'center' }),
  )
  const observedBounds = await expandedSvg.boundingBox()
  if (!observedBounds) throw new Error('Observed chart bounds missing')
  const observedPoint = await observedMarker.evaluate((element) => ({
    x: Number(element.getAttribute('cx')),
    y: Number(element.getAttribute('cy')),
  }))
  await page.mouse.move(observedBounds.x + observedPoint.x + 1, observedBounds.y + observedPoint.y)
  await expect(chart.getByTestId('chart-tooltip')).toContainText('2026-11-15')
  await expect(chart.getByTestId('chart-tooltip')).toContainText('实际测量')
  await expect(chart.getByTestId('chart-tooltip')).toContainText('计划目标')
  await page.screenshot({
    path: test.info().outputPath('health-chart-tooltip-desktop.png'),
    fullPage: true,
  })
  await page.mouse.move(0, 0)

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
    await expect(chart.getByLabel(copy.range)).toHaveValue('180')
    await expect(chart.getByLabel(copy.smoothingWindow)).toHaveValue('7')
    const checkpoint = overview.getByText(copy.checkpoint, { exact: true }).locator('..')
    await expect(checkpoint).toContainText('78.5 kg')
    await expect(checkpoint).toContainText('2027-01-10')
    const phaseSummary = overview.getByText(copy.relativeStart, { exact: true }).locator('..')
    const baseline = measurements.filter(
      (row) =>
        !row.excluded && row.weight !== null && measurementDay(row.measuredAt) === '2026-10-26',
    )
    expect(baseline.length).toBeGreaterThan(0)
    const startWeight = baseline.reduce((sum, row) => sum + (row.weight ?? 0), 0) / baseline.length
    const latestWeight = measurements.find((row) => !row.excluded && row.weight !== null)?.weight
    expect(typeof latestWeight).toBe('number')
    const format = (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
    await expect(phaseSummary).toContainText(`2026-10-26 · ${format(startWeight)} ${copy.units.kg}`)
    await expect(phaseSummary).toContainText(
      `${format((latestWeight ?? 0) - startWeight)} ${copy.units.kg}`,
    )

    await expect(
      overview.getByRole('heading', { name: copy.metrics.waist, exact: true }),
    ).toHaveCount(0)
    for (const metric of [
      'weight',
      'bodyFat',
      'musclePercentage',
      'proteinPercentage',
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
    for (const metric of ['proteinPercentage', 'bodyScore', 'metabolicAge'] as const) {
      const card = overview.getByRole('article').filter({
        has: page.getByRole('heading', { name: copy.metrics[metric], exact: true }),
      })
      const latest = measurements.find((row) => displayMetricValue(row, metric) !== null)
      expect(latest).toBeDefined()
      await expect(card).toContainText(
        new Intl.NumberFormat(locale, {
          maximumFractionDigits: metric === 'proteinPercentage' ? 1 : 2,
        }).format(displayMetricValue(latest, metric) ?? 0),
      )
      await expect(card).toContainText(measurementDay(latest?.measuredAt ?? ''))
    }
    const score = overview.getByRole('article').filter({ hasText: copy.metrics.bodyScore })
    const age = overview.getByRole('article').filter({ hasText: copy.metrics.metabolicAge })
    await expect(score).toContainText(copy.units.points)
    await expect(age).toContainText(copy.units.years)
    await expect(score.locator('svg[viewBox="0 0 160 36"]')).toHaveCount(0)
    await expect(age.locator('svg[viewBox="0 0 160 36"]')).toHaveCount(0)
    for (const metric of [
      'weight',
      'bodyFat',
      'bodyWater',
      'musclePercentage',
      'proteinPercentage',
      'bmi',
      'basalMetabolism',
      'visceralFat',
      'metabolicAge',
    ] as const) {
      const card = overview.getByRole('article').filter({
        has: page.getByRole('heading', { name: copy.metrics[metric], exact: true }),
      })
      const trigger = card.getByRole('button', {
        name: copy.assessment.open.replace('{metric}', copy.metrics[metric]),
        exact: true,
      })
      await trigger.click()
      const detail = page.getByRole('dialog')
      await expect(
        detail.getByRole('heading', { name: copy.metrics[metric], exact: true }),
      ).toBeVisible()
      await expect(detail).not.toContainText('MISSING_MESSAGE')
      if (metric === 'bodyFat' || metric === 'bodyWater') {
        await expect(detail.getByTestId('assessment-scale')).toBeVisible()
        await expect(detail).toContainText(
          copy.assessment.grades[metric === 'bodyFat' ? 'veryHigh' : 'standard'],
        )
      }
      if (metric === 'basalMetabolism')
        await expect(detail).toContainText(copy.assessment.sources.mifflin)
      if (metric === 'basalMetabolism' || metric === 'visceralFat') {
        await expect(detail).toContainText(copy.assessment.methods.xiaomiReport)
        await expect(detail.getByTestId('assessment-scale')).toBeVisible()
      }
      const trend = detail.getByTestId('metric-detail-trend')
      const trendTitle = trend.locator('summary')
      await expect(trendTitle).toContainText(copy.assessment.detailTrend)
      await trendTitle.click()
      await expect(trend.getByRole('img')).toBeVisible()
      if (metric === 'weight') await expect(trend.locator('circle[data-observed]')).toHaveCount(22)
      const composition = [
        { rate: 'bodyFat', mass: 'fatMass', method: 'chinaFat' },
        { rate: 'bodyWater', mass: 'waterMass', method: 'water' },
        { rate: 'musclePercentage', mass: 'muscleMass', method: 'xiaomiReport' },
        { rate: 'proteinPercentage', mass: 'proteinMass', method: 'xiaomiReport' },
      ] as const
      const selected = composition.find(({ rate }) => rate === metric)
      if (selected) {
        await expect(detail).toContainText(copy.assessment.methods[selected.method])
        const massMetric = selected.mass
        const latest = measurements.find((row) => displayMetricValue(row, metric) !== null)
        await expect(detail.getByTestId('composition-values')).toContainText(copy.metrics[metric])
        await expect(detail.getByTestId('composition-values')).toContainText(
          format(displayMetricValue(latest, massMetric) ?? 0),
        )
        await expect(detail.getByTestId('composition-values')).toContainText(
          new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
            displayMetricValue(latest, metric) ?? 0,
          ),
        )
        const controls = detail.getByRole('group', { name: copy.assessment.compositionView })
        const massButton = controls.getByRole('button', {
          name: `${copy.metrics[massMetric]} (${copy.units.kg})`,
          exact: true,
        })
        await massButton.click()
        await expect(massButton).toHaveAttribute('aria-pressed', 'true')
        await expect(detail.getByTestId('assessment-scale')).toContainText(copy.units.kg)
        await expect(trendTitle).toContainText(copy.metrics[massMetric])
        await expect(trend.getByTestId('chart-reading')).toContainText(copy.units.kg)
        const rateButton = controls.getByRole('button', {
          name: `${copy.metrics[metric]} (%)`,
          exact: true,
        })
        await rateButton.click()
        await expect(rateButton).toHaveAttribute('aria-pressed', 'true')
        await expect(detail.getByTestId('assessment-scale')).toContainText('%')
        await expect(detail.getByRole('img')).toBeVisible()
        await trendTitle.click()
        if (locale === 'zh-cn' && metric === 'musclePercentage')
          await detail.screenshot({
            path: test.info().outputPath('health-composition-desktop.png'),
          })
      }
      if (locale === 'zh-cn' && metric === 'bodyFat')
        await detail.screenshot({ path: test.info().outputPath('health-assessment-desktop.png') })
      expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
      await page.keyboard.press('Escape')
      await expect(detail).toHaveCount(0)
      await expect(trigger).toBeFocused()
    }
    await expect(
      page.getByRole('heading', { name: copy.phaseChallenge, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: copy.phaseMaintenance, exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: copy.stagePlan, exact: true })).toBeVisible()
    await chart.getByRole('combobox', { name: copy.metric }).selectOption('musclePercentage')
    await expect(chart.getByTestId('chart-reading')).toContainText('%')
    await chart.getByRole('combobox', { name: copy.metric }).selectOption('proteinPercentage')
    await expect(chart.getByTestId('chart-reading')).toContainText('%')
    await chart.getByRole('combobox', { name: copy.metric }).selectOption('weight')
    await chart.getByRole('combobox', { name: copy.metric }).selectOption('fatMass')
    await expect(chart.getByTestId('chart-reading')).toContainText(copy.units.kg)
    await chart.getByRole('combobox', { name: copy.metric }).selectOption('weight')
    await chart.getByLabel(copy.range).selectOption('90')

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
    await overview
      .getByRole('button', {
        name: copy.assessment.open.replace('{metric}', copy.metrics.bodyFat),
        exact: true,
      })
      .tap()
    await expect(page.getByRole('dialog').getByTestId('assessment-scale')).toBeVisible()
    await page
      .getByRole('dialog')
      .screenshot({ path: test.info().outputPath(`health-assessment-${locale}-mobile.png`) })
    await page.keyboard.press('Escape')
    await page.locator('#health-trend svg').tap({ position: { x: 180, y: 100 } })
    await expect(chart.getByTestId('chart-reading')).toContainText(copy.gapEstimate)
    await expect(chart.getByTestId('chart-tooltip')).toContainText(copy.gapEstimate)
    expect(
      await chart.getByRole('img').evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(400)
    await chart.screenshot({
      path: test.info().outputPath(`health-chart-tooltip-${locale}-mobile.png`),
    })

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
  await page.getByRole('button', { name: '主题模式', exact: true }).click()
  await page.getByRole('menuitemradio', { name: '深色模式', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).not.toHaveClass(/light/)
  await overview.getByRole('button', { name: '查看体脂率评级详情', exact: true }).tap()
  expect(
    await page.getByRole('dialog').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe('oklch(0.985 0.002 247.839)')
  await page
    .getByRole('dialog')
    .screenshot({ path: test.info().outputPath('health-assessment-mobile-dark.png') })
  await page.keyboard.press('Escape')
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

test('public nutrition and owner body targets keep distinct visibility and display', async ({
  page,
}) => {
  const { syntheticBodyTargets } = await import('../fixtures/health-targets')
  const { measurementSchema } = await import('../../src/health/contracts')
  const baselineDate = '2026-12-01'
  const date = '2026-12-02'
  const measuredAt = `${date}T08:00:00+08:00`
  const reading = normalizeSmartscaleRow({ Date: measuredAt, Weight: 86, BodyFat: 25 })
  const measurement = measurementSchema.parse({
    ...reading,
    id: randomUUID(),
    source: 'smartscale',
    revision: 0,
    createdAt: measuredAt,
    updatedAt: measuredAt,
  })
  const baselineTime = `${baselineDate}T08:00:00+08:00`
  const baselineMeasurement = measurementSchema.parse({
    ...measurement,
    ...normalizeSmartscaleRow({ Date: baselineTime, Weight: 87, BodyFat: 26 }),
    id: randomUUID(),
    createdAt: baselineTime,
    updatedAt: baselineTime,
  })
  let ownerView = false
  await page.route('**/api/ops/auth/session', (route) =>
    route.fulfill({
      json: ownerView
        ? { authenticated: true, account: { username: 'fixture-owner', role: 'owner' } }
        : { authenticated: false, account: null },
    }),
  )
  await page.route('**/api/ops/health/snapshot?*', (route) =>
    route.fulfill({
      json: {
        plan: {
          startWeight: 90,
          goalWeight: 70,
          longTermWeight: 70,
          startDate: '2026-10-01',
          holdStart: '2026-10-15',
          holdEnd: '2026-10-25',
          endDate: '2027-03-20',
          maintainAfterGoal: true,
          checkpoint: { date: '2027-01-10', weight: 78.5 },
          bodyTargets: { ...syntheticBodyTargets, baselineDate },
          targets: [
            { date: '2026-10-01', targetMin: 90, targetMax: 90 },
            ...syntheticBodyTargets.points.map(({ date, weight }) => ({
              date,
              targetMin: weight,
              targetMax: weight,
            })),
            { date: '2027-03-20', targetMin: 70, targetMax: 70 },
          ],
        },
        planMessages: JSON.parse(
          readFileSync(resolve(import.meta.dirname, '../../messages/zh-cn.json'), 'utf8'),
        ).HealthPlan,
        measurements: [measurement, baselineMeasurement],
        planOverrides: [],
        revision: 0,
        sync: { lastSuccessAt: null, sourceUpdatedAt: null, lastError: null },
      },
    }),
  )
  await page.clock.setFixedTime(new Date('2026-12-18T00:00:00.000Z'))
  await page.goto('/weight-loss')
  const publicPlan = page.getByRole('region', { name: '饮食与热量计划' })
  await expect(publicPlan.locator('details')).toHaveJSProperty('open', false)
  await publicPlan.locator('summary').click()
  await expect(publicPlan.getByText('1,425', { exact: false }).first()).toBeVisible()
  await expect(publicPlan).toContainText('2,855')
  await expect(publicPlan).toContainText('1,430')
  await expect(
    page.getByText('登录 Owner 账号后可查看个人计划、身体指标和历史记录。'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '身体成分目标' })).toHaveCount(0)
  const publicHtml = await (await page.request.get('/weight-loss')).text()
  expect(publicHtml).not.toContain(syntheticBodyTargets.versionDate)

  ownerView = true
  await page.reload()
  const chart = page.locator('#health-trend')
  const overview = page.getByRole('region', { name: '减重总览' })
  await expect(overview.getByText('阶段目标', { exact: true }).locator('..')).toContainText(
    '78.5 kg',
  )
  await expect(publicPlan.locator('details')).toHaveJSProperty('open', false)
  await expect(publicPlan.locator('xpath=following-sibling::*[1]')).toHaveAttribute(
    'id',
    'health-trend',
  )
  await expect(chart.getByTestId('chart-plan-line')).toBeVisible()
  await expect(chart.locator('circle[class*="text-emerald"]')).toHaveCount(0)
  await chart.getByRole('combobox', { name: '指标' }).selectOption('bodyFat')
  await expect(chart.getByTestId('chart-plan-line')).toBeVisible()
  await expect(chart.locator('circle[class*="text-emerald"]')).toHaveCount(0)
  const slider = chart.getByRole('slider')
  await slider.press('End')
  await expect(chart.getByTestId('chart-plan-reading')).toContainText('20 %')
  await slider.press('ArrowLeft')
  await expect(chart.getByTestId('chart-plan-reading')).toContainText('目标插值')

  await page.getByRole('button', { name: baselineDate, exact: true }).click()
  const baselineDetail = page.getByRole('table', { name: baselineDate })
  await expect(
    baselineDetail.getByRole('row').filter({ hasText: '体脂率' }).getByRole('cell'),
  ).toHaveText(['—', '—', '26 %', '—'])
  await page.getByRole('button', { name: date, exact: true }).click()
  const detail = page.getByRole('table', { name: date })
  await expect(detail.getByRole('row')).toHaveCount(12)
  const bodyFat = detail.getByRole('row').filter({ hasText: '体脂率' })
  await expect(bodyFat.getByRole('cell')).toHaveText([
    '24.4 %',
    '-1.6 百分点',
    '25 %',
    '+0.6 百分点',
  ])
  await expect(detail.getByRole('row').filter({ hasText: '骨骼肌量' })).toContainText('暂无数据')
})
