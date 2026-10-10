import { expect, test } from '@playwright/test'

test('Blog/Wiki math is server-rendered with local fonts, themes and mobile scrolling across locales', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const failedFonts: string[] = []
  page.on('response', (response) => {
    if (/\.(woff2?|ttf)(?:\?|$)/.test(response.url()) && !response.ok()) {
      failedFonts.push(response.url())
    }
  })
  try {
    for (const prefix of ['', '/zh-cn', '/zh-hk', '/zh-tw', '/en-us']) {
      for (const route of [
        '/blog/2026-07-21-vscode-ren-wu-lan-qi-dong-codex-cha-jian-da-bu-kai',
        '/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
      ]) {
        await page.setViewportSize({ height: 900, width: 1440 })
        const response = await page.goto(`${prefix}${route}`)
        expect(response?.status()).toBe(200)
        const formulas = page.locator('.prose-site .katex')
        await expect(formulas).toHaveCount(4)
        await expect(page.locator('.prose-site .katex-display')).toHaveCount(2)
        await expect(page.locator('.prose-site math')).toHaveCount(4)
        await expect(page.locator('.katex-error')).toHaveCount(0)
        await page.evaluate(async () => document.fonts.ready)
        expect(
          await page.evaluate(() =>
            [...document.fonts].some(
              (font) => font.family === 'KaTeX_Main' && font.status === 'loaded',
            ),
          ),
        ).toBe(true)
        expect(failedFonts).toEqual([])
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => {
            document.documentElement.classList.toggle('dark', value === 'dark')
          }, theme)
          await expect(formulas.first().locator('.katex-html')).toBeVisible()
          const colors = await formulas.first().evaluate((element) => ({
            formula: getComputedStyle(element).color,
            prose: getComputedStyle(element.closest('.prose-site') ?? element).color,
          }))
          expect(colors.formula).toBe(colors.prose)
        }
        await page.setViewportSize({ height: 844, width: 390 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const longFormula = page.locator('.katex-display').last()
        expect(
          await longFormula.evaluate((element) => ({
            overflow: getComputedStyle(element).overflowX,
            wider: element.scrollWidth > element.clientWidth,
          })),
        ).toEqual({ overflow: 'auto', wider: true })
        await longFormula.evaluate((element) => {
          element.scrollLeft = 100
        })
        expect(await longFormula.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
        if (prefix === '' && route.startsWith('/blog')) {
          await page
            .locator('.prose-site')
            .screenshot({ path: test.info().outputPath('math-mobile.png') })
        }
      }
    }
  } finally {
    await context.close()
  }
})
