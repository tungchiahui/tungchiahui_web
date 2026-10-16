import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { type StartPayload, startPayloadSchema } from '../../src/start/contracts'

const enUs = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../messages/en-us.json'), 'utf8'),
) as typeof import('../../messages/en-us.json')
const copy = enUs.Web.start
const initialPayload: StartPayload = {
  version: 1,
  sections: [
    { title: 'Original', items: [] },
    { title: 'Original', items: [] },
  ],
  history: [],
  engine: 'baidu',
  background: 0,
  detailed: true,
}
const updateSchema = z.object({ expectedRevision: z.number().int(), payload: startPayloadSchema })
const snapshot = (payload: StartPayload, revision: number) => ({
  authenticated: true,
  account: { username: 'owner', role: 'owner' },
  dataset: { payload, revision },
})

test('Start serializes in-flight edits, preserves rename focus and reloads the latest saved data', async ({
  page,
}) => {
  let saved = snapshot(initialPayload, 1)
  const writes: z.infer<typeof updateSchema>[] = []
  let releaseFirst: () => void = () => undefined
  const firstReply = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  await page.route('**/api/start/backgrounds', (route) => route.fulfill({ status: 503, json: {} }))
  await page.route('**/api/ops/start/data', async (route) => {
    if (route.request().method() !== 'PUT') return route.fulfill({ json: saved })
    const update = updateSchema.parse(route.request().postDataJSON())
    writes.push(update)
    if (writes.length === 1) await firstReply
    expect(update.expectedRevision).toBe(saved.dataset.revision)
    saved = snapshot(update.payload, saved.dataset.revision + 1)
    return route.fulfill({ json: saved })
  })
  await page.goto('/en-us/start', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('owner', { exact: true })).toBeVisible()
  const engine = (name: string) =>
    page.getByRole('button', {
      name: copy.switchEngine.replace('{engine}', name),
    })
  await engine('Baidu').click()
  await expect.poll(() => writes.length).toBe(1)
  await engine('Google').click()
  await page.getByRole('button', { name: copy.edit, exact: true }).click()
  const name = page.getByRole('textbox', { name: copy.sectionName }).first()
  await name.focus()
  await name.pressSequentially('X')
  await expect(name).toBeFocused()
  await name.pressSequentially('Y')
  await expect(name).toHaveValue('OriginalXY')
  await expect(name).toBeFocused()
  expect(writes).toHaveLength(1)
  releaseFirst()
  await expect.poll(() => writes.length).toBe(2)
  await expect.poll(() => saved.dataset.revision).toBe(3)
  expect(writes[0]?.payload.engine).toBe('google')
  expect(writes[1]?.expectedRevision).toBe(2)
  expect(saved.dataset.payload.engine).toBe('bing')
  expect(saved.dataset.payload.sections[0]?.title).toBe('OriginalXY')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(engine('Bing')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'OriginalXY', exact: true })).toBeVisible()
})

test('Start pauses conflicts and exports a complete draft before a guarded reload', async ({
  page,
}) => {
  let writes = 0
  let saved = snapshot(initialPayload, 1)
  await page.route('**/api/start/backgrounds', (route) => route.fulfill({ status: 503, json: {} }))
  await page.route('**/api/ops/start/data', (route) => {
    if (route.request().method() !== 'PUT') return route.fulfill({ json: saved })
    writes += 1
    if (writes === 1) {
      saved = snapshot(initialPayload, 2)
      return route.fulfill({ status: 409, json: { error: 'revision_conflict' } })
    }
    const update = updateSchema.parse(route.request().postDataJSON())
    expect(update.expectedRevision).toBe(saved.dataset.revision)
    saved = snapshot(update.payload, saved.dataset.revision + 1)
    return route.fulfill({ json: saved })
  })
  await page.goto('/en-us/start', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('owner', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: copy.switchEngine.replace('{engine}', 'Baidu') }).click()
  await expect(page.getByRole('status')).toHaveText(copy.conflict)
  await page.getByRole('button', { name: copy.switchEngine.replace('{engine}', 'Google') }).click()
  await page.waitForTimeout(1400)
  expect(writes).toBe(1)
  await expect(page.getByRole('button', { name: copy.retrySave })).toHaveCount(0)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: copy.exportDraft }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('start-page-unsaved-draft.json')
  const path = await download.path()
  if (!path) throw new Error('Missing draft download')
  const draft = startPayloadSchema.parse(JSON.parse(await readFile(path, 'utf8')) as unknown)
  expect(draft).toEqual({ ...initialPayload, engine: 'bing' })
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(copy.reloadConfirm)
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: copy.reload }).click()
  await expect(page.getByRole('status')).toHaveText(copy.conflict)
  await expect(
    page.getByRole('button', { name: copy.switchEngine.replace('{engine}', 'Bing') }),
  ).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.getByRole('button', { name: copy.reload }).click(),
  ])
  await expect(
    page.getByRole('button', { name: copy.switchEngine.replace('{engine}', 'Baidu') }),
  ).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'start-page-unsaved-draft.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(draft)),
  })
  await expect.poll(() => saved.dataset.revision).toBe(3)
  expect(saved.dataset.payload).toEqual(draft)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(
    page.getByRole('button', { name: copy.switchEngine.replace('{engine}', 'Bing') }),
  ).toBeVisible()
})

test('header logout retains the authenticated UI on failure and succeeds on explicit retry', async ({
  page,
}) => {
  let authenticated = true
  let attempts = 0
  await page.route('**/api/ops/auth/session', (route) => {
    if (route.request().method() === 'DELETE') {
      attempts += 1
      if (attempts === 1) return route.fulfill({ status: 503, json: { error: 'unavailable' } })
      authenticated = false
    }
    return route.fulfill({
      json: {
        authenticated,
        account: authenticated ? { username: 'owner', role: 'owner' } : null,
      },
    })
  })
  await page.goto('/en-us/about', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'owner', exact: true }).click()
  const logoutAlert = page.getByRole('alert').filter({ hasText: enUs.Personal.logoutFailed })
  await expect(logoutAlert).toHaveText(enUs.Personal.logoutFailed)
  await expect(page.getByRole('button', { name: 'owner', exact: true })).toBeEnabled()
  expect(authenticated).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('personal-auth-change'))).toBeNull()
  await page.getByRole('button', { name: 'owner', exact: true }).click()
  await expect(page.getByRole('button', { name: enUs.Personal.login, exact: true })).toBeVisible()
  await expect(logoutAlert).toHaveCount(0)
  expect(authenticated).toBe(false)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: enUs.Personal.login, exact: true })).toBeVisible()
})
