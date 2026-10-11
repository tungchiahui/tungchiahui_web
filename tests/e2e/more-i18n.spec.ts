import { expect, test } from '@playwright/test'

const locales = ['zh-cn', 'zh-hk', 'zh-tw', 'en-us'] as const

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AppLocale } from '../../src/i18n/locales'
import type { StartPayload } from '../../src/start/contracts'

const messagesForLocale = (locale: AppLocale) =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../../messages/${locale}.json`), 'utf8'),
  ) as typeof import('../../messages/zh-cn.json')
const sourceDefaults: StartPayload = {
  version: 1,
  sections: [],
  history: [],
  engine: 'baidu',
  background: 0,
  detailed: false,
}

const pages = [
  'about',
  'cv',
  'friend',
  'mylogo',
  'more',
  'stats',
  'music',
  'start',
  'tech-footprint',
  'weight-loss',
] as const
const metadataKeys = {
  about: 'about',
  cv: 'cv',
  friend: 'friend',
  mylogo: 'mylogo',
  more: 'more',
  stats: 'stats',
  music: 'music',
  start: 'start',
  'tech-footprint': 'tech',
  'weight-loss': 'weight',
} as const
for (const locale of locales) {
  test(`More pages, accessible controls and metadata use ${locale}`, async ({ page }) => {
    test.setTimeout(180_000)
    const copy = messagesForLocale(locale)
    const path = (slug: string) => `/${locale}/${slug}`
    for (const slug of pages) {
      await page.goto(path(slug), { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1').first()).toBeVisible()
      await expect(page).toHaveTitle(new RegExp(copy.Web.special[`${metadataKeys[slug]}Title`]))
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        copy.Web.special[`${metadataKeys[slug]}Description`],
      )
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(locale === 'zh-cn' ? `/${slug}$` : `/${locale}/${slug}$`),
      )
      if (['about', 'cv', 'friend', 'mylogo'].includes(slug) && locale === 'en-us') {
        expect(await page.locator('.legacy-info-page').innerText()).not.toMatch(/[\p{Script=Han}]/u)
        expect(
          await page
            .locator('.legacy-info-page img[alt]')
            .evaluateAll((images) => images.map((image) => image.getAttribute('alt')).join(' ')),
        ).not.toMatch(/[\p{Script=Han}]/u)
      }
      if (slug === 'about')
        await expect(page.getByRole('link', { name: copy.Web.information.viewCv })).toHaveAttribute(
          'href',
          locale === 'zh-cn' ? '/zh-cn/cv' : path('cv'),
        )
      if (slug === 'more') {
        for (const destination of [
          'cv',
          'friend',
          'mylogo',
          'music',
          'stats',
          'start',
          'tech-footprint',
          'weight-loss',
        ]) {
          await expect(
            page.locator(
              `.more-directory a[href="${locale === 'zh-cn' ? `/${destination}` : path(destination)}"]`,
            ),
          ).toHaveCount(1)
        }
        await expect(
          page.getByRole('button', {
            name: copy.Web.moreDirectory.copyLabel.replace(
              '{service}',
              copy.Web.moreDirectory.primaryCdnTitle,
            ),
          }),
        ).toBeVisible()
      }
      if (slug === 'start')
        await expect(
          page.getByRole('textbox', { name: copy.Web.start.search, exact: true }),
        ).toBeVisible()
      if (slug === 'music')
        await expect(
          page.getByRole('slider', { name: copy.Web.music.volume, exact: true }).first(),
        ).toBeVisible()
      if (slug === 'tech-footprint')
        await expect(
          page.getByRole('button', { name: copy.Personal.login, exact: true }).first(),
        ).toBeVisible()
      if (slug === 'weight-loss')
        await expect(page.getByRole('img', { name: copy.Weight.trendTitle })).toBeVisible()
    }
  })
}

test('Start translates built-ins, reports invalid imports and preserves saved author strings', async ({
  page,
}) => {
  const copy = messagesForLocale('en-us').Web.start
  let data = {
    authenticated: true,
    account: { username: 'owner', role: 'owner' },
    dataset: { revision: 0, payload: sourceDefaults },
  }
  await page.route('**/api/ops/start/data', (route) => route.fulfill({ json: data }))
  await page.route('**/api/start/backgrounds', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  )
  await page.goto('/en-us/start', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('owner', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: copy.detailed, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Everyday tools' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: copy.switchEngine.replace('{engine}', 'Baidu') }),
  ).toBeVisible()
  await expect(page.locator('.start-wallpaper-credit')).toContainText('Valley')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"bad":true}'),
  })
  await expect(page.getByRole('status')).toContainText(copy.importFailed)
  await expect(page.getByRole('heading', { name: 'Everyday tools' })).toBeVisible()
  data = {
    ...data,
    dataset: {
      revision: 1,
      payload: {
        ...data.dataset.payload,
        detailed: true,
        sections: [
          {
            title: '作者中文分组',
            items: [
              {
                id: 'author',
                name: '作者书签',
                desc: '作者描述',
                url: 'https://example.test',
                color: '#308eda',
              },
            ],
          },
        ],
      },
    },
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '作者中文分组' })).toBeVisible()
  await expect(page.getByRole('link', { name: /作者书签/ })).toContainText('作者描述')
  data = {
    ...data,
    dataset: { ...data.dataset, payload: { ...data.dataset.payload, sections: [] } },
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText(copy.emptyBookmarks)).toBeVisible()
})

test('More copy failure, stats retry and music empty state use the selected locale', async ({
  page,
}) => {
  const copy = messagesForLocale('en-us').Web
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied')
        },
      },
    }),
  )
  await page.goto('/en-us/more', { waitUntil: 'domcontentloaded' })
  const copyButton = page.getByRole('button', {
    name: copy.moreDirectory.copyLabel.replace('{service}', copy.moreDirectory.primaryCdnTitle),
  })
  await copyButton.click()
  await expect(copyButton).toHaveText(copy.moreDirectory.copyFailed)
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    }),
  )
  await copyButton.click()
  await expect(copyButton).toHaveText(copy.moreDirectory.copied)
  let failed = true
  await page.route('**/api/stats', (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { error: 'unavailable' } }
        : {
            json: {
              summary: {
                averageVisitSeconds: 0,
                bounces: 0,
                bounceRate: 0,
                pagesPerVisit: 0,
                pageviews: 0,
                totalTime: 0,
                visitors: 0,
                visits: 0,
              },
              top: {},
            },
          },
    ),
  )
  await page.goto('/en-us/stats', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('status')).toContainText(copy.stats.unavailable)
  failed = false
  await page.getByRole('button', { name: copy.stats.refresh, exact: true }).click()
  await expect(page.locator('.stats-panel').first()).toContainText(copy.stats.empty)
  await page.route('**/api/music/playlist', (route) => route.fulfill({ json: [] }))
  await page.goto('/en-us/music', { waitUntil: 'domcontentloaded' })
  await expect(
    page.locator('.music-page').getByText(copy.music.emptyPlaylist).first(),
  ).toBeVisible()
  await page.unroute('**/api/music/playlist')
  await page.route('**/api/music/playlist', (route) =>
    route.fulfill({
      json: [
        {
          id: 'untitled',
          title: '',
          artist: '',
          cover: '',
          lyricSource: '',
          url: 'https://example.test/audio.mp3',
          selfHosted: false,
        },
      ],
    }),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.music-page h1')).toHaveText(
    copy.music.untitledTrack.replace('{number}', '1'),
  )
  await expect(page.locator('.music-page')).toContainText(copy.music.unknownArtist)
})
