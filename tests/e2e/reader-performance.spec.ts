import { expect, test } from '@playwright/test'

const wiki = '/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi'

for (const path of [wiki, '/blog/2026-07-21-vscode-ren-wu-lan-qi-dong-codex-cha-jian-da-bu-kai']) {
  test(`preserves code size and scrolling on desktop and mobile: ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('.code-block').first()).toBeVisible()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      const size = await page
        .locator('.prose-site pre code')
        .first()
        .evaluate((element) => ({
          font: getComputedStyle(element).fontSize,
          line: getComputedStyle(element).lineHeight,
          whitespace: getComputedStyle(element).whiteSpace,
        }))
      expect(size).toEqual({ font: '14px', line: '20px', whitespace: 'pre' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  })
}

test('shows link feedback while a Wiki chapter navigation waits for the server', async ({
  page,
}) => {
  await page.goto('/wiki')
  const link = page.locator(`.wiki-document-chapters a[href="${wiki}"]`)
  await link.locator('xpath=ancestor::details').locator('summary').click()
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (
      url.pathname === wiki &&
      url.searchParams.has('_rsc') &&
      !route.request().headers()['next-router-prefetch']
    ) {
      requested = true
      await held
    }
    await route.continue()
  })
  try {
    await link.click()
    await expect.poll(() => requested).toBe(true)
    await expect(link.getByRole('status')).toContainText('正在加载页面')
  } finally {
    release()
  }
  await expect(page.locator('[data-article-type="wiki"]')).toBeVisible()
  await expect(page).toHaveURL(wiki)
})
