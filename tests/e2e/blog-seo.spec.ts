import { expect, test } from '@playwright/test'

test('blog journal stays readable on desktop and mobile with usable search', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/blog')
  await expect(page.getByRole('heading', { level: 1, name: '博客', exact: true })).toBeVisible()
  await expect(page.locator('.blog-entry.is-latest')).toHaveCount(1)
  const columns = await page
    .locator('.blog-journal-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns)
  expect(columns.split(' ')).toHaveLength(1)
  const rowHeights = await page
    .locator('.blog-entry-link')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
  expect(Math.max(...rowHeights)).toBeLessThan(160)
  const count = await page.locator('[data-content-card="blog"]').count()
  await expect(page.locator('.blog-journal-count strong')).toHaveText(String(count))
  await page.screenshot({ path: test.info().outputPath('blog-desktop.png'), fullPage: true })
  await page.getByRole('searchbox', { name: '搜索博客标题和内容' }).fill('Revalidated')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.getByText('正文匹配')).toBeVisible()
  await expect(page.locator('.blog-entry.is-latest')).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
  await page.getByRole('link', { name: '查看全部', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.blog-entry.is-latest')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: test.info().outputPath('blog-mobile.png'), fullPage: true })
  await page
    .getByRole('searchbox', { name: '搜索博客标题和内容' })
    .fill('zzzz-no-matching-document')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.getByText('当前语言中没有找到相关内容。')).toBeVisible()
})

test('articles and legacy aliases expose canonical, alternate, social and safe structured metadata', async ({
  page,
}) => {
  const path = '/blog/2026-01-06-xin-bo-ke-qi-yong'
  for (const locale of ['zh-cn', 'zh-hk', 'zh-tw', 'en-us']) {
    await page.goto(`/${locale}${path}`)
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(canonical).not.toBeNull()
    expect(new URL(canonical ?? '').pathname).toBe(locale === 'zh-cn' ? path : `/${locale}${path}`)
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(5)
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/opengraph-image/,
    )
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')
    const structured = await page
      .locator('article > script[type="application/ld+json"]')
      .textContent()
    expect(JSON.parse(structured ?? '{}')).toMatchObject({
      '@type': 'BlogPosting',
      headline: await page.locator('article > header h1').innerText(),
      mainEntityOfPage: { '@id': canonical },
    })
  }
  await page.goto('/blog/newblogenable!')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`${path}$`),
  )
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Revalidated without rebuilding.',
  )
  await page.goto('/search')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
})

test('robots, sitemap and the share image are available without indexing duplicate route forms', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toContain('Disallow: /api/')
  expect(await robots.text()).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/)
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()['content-type']).toContain('xml')
  const xml = await sitemap.text()
  expect(xml).toContain('/blog/2026-01-06-xin-bo-ke-qi-yong</loc>')
  expect(xml).not.toContain('/blog/newblogenable!</loc>')
  expect(xml).not.toMatch(/<loc>[^<]*\/zh-cn(?:\/|<)/)
  expect(xml).not.toMatch(/<loc>[^<]*\/search/)
  expect(xml).toContain('hreflang="zh-HK"')
  const image = await request.get('/opengraph-image')
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toContain('image/png')
  expect((await image.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
})
