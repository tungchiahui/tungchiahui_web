import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { AppLocale } from '../../src/i18n/locales'

const messagesForLocale = (locale: AppLocale) =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../../messages/${locale}.json`), 'utf8'),
  ) as typeof import('../../messages/zh-cn.json')

test('Professional pages keep project content free of floating player overlays', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en-us/cv', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.music-floating')).toHaveCount(0)
  await page.locator('.cv-project').first().click()
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`${new URL(page.url()).pathname}$`),
  )
  await expect(page.locator('.music-floating')).toHaveCount(0)
  await page.goto('/en-us/projects', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.project-card').first()).toBeVisible()
  await expect(page.locator('.music-floating')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

for (const locale of ['zh-cn', 'zh-hk', 'zh-tw', 'en-us'] as const) {
  test(`Standalone contact page and localized navigation: ${locale}`, async ({ page }) => {
    const copy = messagesForLocale(locale).Web
    await page.goto(`/${locale}/cv`, { waitUntil: 'domcontentloaded' })
    const contactLink = page
      .locator('[data-site-header]')
      .getByRole('link', { name: copy.portfolio.contact, exact: true })
    await expect(contactLink).toHaveAttribute('href', `/${locale}/contact`)
    await contactLink.click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/contact$`))
    await expect(page.getByRole('heading', { name: copy.portfolio.contact })).toBeVisible()
    await expect(contactLink).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.contact-details a[href^="mailto:"]')).toBeVisible()
    await expect(page.locator('.contact-details a[href^="https://github.com/"]')).toBeVisible()
    await expect(page.locator('.contact-details dt')).toHaveText([
      copy.information.email,
      copy.information.github,
      copy.information.wechat,
      copy.information.qq,
    ])
    await expect(page.locator('.cv-page')).toHaveCount(0)
    await expect(page.locator('.music-floating')).toHaveCount(0)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${locale === 'zh-cn' ? '' : `/${locale}`}/contact$`),
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.locator('[data-locale-switch] a[hreflang="en-us"]').click()
    await expect(page).toHaveURL(/\/en-us\/contact$/)
    await expect(
      page.getByRole('heading', { name: messagesForLocale('en-us').Web.portfolio.contact }),
    ).toBeVisible()
  })

  test(`Resume to project, all projects and language switching: ${locale}`, async ({ page }) => {
    const copy = messagesForLocale(locale).Web
    await page.goto(`/${locale}/cv`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: copy.information.name })).toBeVisible()
    await expect(page.getByRole('button', { name: copy.portfolio.printResume })).toBeVisible()
    await expect(page.locator('.music-floating')).toHaveCount(0)
    await expect(page.locator('.cv-project')).toHaveCount(1)
    await page.locator('.cv-project').click()
    await expect(page).toHaveURL(new RegExp(`/${locale}/projects/robot-navigation-fixture$`))
    await expect(page.locator('h1')).toHaveText('Robot navigation fixture')
    await expect(page.locator('.prose-site')).toContainText('ROS2_Control')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${locale === 'zh-cn' ? '' : `/${locale}`}/projects/robot-navigation-fixture$`),
    )
    await page.locator('[data-locale-switch] a[hreflang="en-us"]').click()
    await expect(page).toHaveURL(/\/en-us\/projects\/robot-navigation-fixture$/)
    await page
      .getByRole('link', {
        name: messagesForLocale('en-us').Web.portfolio.backProjects,
        exact: true,
      })
      .click()
    await expect(page.locator('.project-card')).toHaveCount(2)
    await expect(page.locator('.project-card').first()).toContainText('Robot navigation fixture')
    await page.goto(`/${locale}/projects/not-a-project`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: copy.notFoundTitle })).toBeVisible()
  })
}

test('Portfolio and resume stay plain white despite dark theme and remain readable on mobile and print', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  for (const path of ['/en-us/cv', '/en-us/projects', '/en-us/projects/robot-navigation-fixture']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1')).toBeVisible()
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(page.locator('.career-shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(page.locator('.project-cover-placeholder')).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
  await page.goto('/en-us/cv', { waitUntil: 'domcontentloaded' })
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('[data-site-header]')).toBeHidden()
  await expect(page.locator('.site-footer')).toBeHidden()
  await expect(page.locator('.cv-print')).toBeHidden()
  await expect(page.locator('.cv-project')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: messagesForLocale('en-us').Web.information.educationTitle }),
  ).toBeVisible()
})
