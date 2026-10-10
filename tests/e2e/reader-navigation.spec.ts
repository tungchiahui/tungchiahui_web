import { expect, type Locator, type Page, test } from '@playwright/test'

const readers = [
  { name: 'Blog', path: '/blog/2026-07-21-vscode-ren-wu-lan-qi-dong-codex-cha-jian-da-bu-kai' },
  {
    name: 'Wiki',
    path: '/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
  },
] as const

function heading(page: Page, number: number) {
  return page.locator(`.prose-site [id="阅读定位-${number}"]`)
}

async function openReader(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect
    .poll(() =>
      page
        .locator('[data-reader-root]')
        .evaluate((root) => getComputedStyle(root).getPropertyValue('--reader-anchor-offset')),
    )
    .not.toBe('')
}

async function expectAligned(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const reader = element.closest('[data-reader-root]')
        if (!reader) throw new Error('Reader is missing')
        const offset = Number.parseFloat(
          getComputedStyle(reader).getPropertyValue('--reader-anchor-offset'),
        )
        return Math.abs(element.getBoundingClientRect().top - offset)
      }),
    )
    .toBeLessThanOrEqual(3)
}

async function expectCurrentVisible(panel: Locator) {
  await expect
    .poll(() =>
      panel.evaluate((element) => {
        const item = element.querySelector('[aria-current]')
        if (!item) return false
        const panelRect = element.getBoundingClientRect()
        const itemRect = item.getBoundingClientRect()
        return itemRect.top >= panelRect.top && itemRect.bottom <= panelRect.bottom
      }),
    )
    .toBe(true)
}

async function holdReaderImage(page: Page) {
  let release = () => {}
  let started = false
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/assets/fixtures/phase-6.svg', async (route) => {
    started = true
    await held
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#4080c0"/></svg>',
    })
  })
  return { release, started: () => started }
}

for (const reader of readers) {
  test(`${reader.name} gently scrolls anchors and the TOC while retaining desktop rails`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await openReader(page, reader.path)
    const trace = await page.evaluate(async () => {
      const panel = document.querySelector<HTMLElement>('.article-reader-toc')
      const link = panel?.querySelector<HTMLAnchorElement>('[data-toc-link="阅读定位-32"]')
      if (!panel || !link) throw new Error('Long reader fixture is missing')
      // Capture the actual animation, including its intermediate positions.
      await new Promise(requestAnimationFrame)
      const positions: Array<{ page: number; panel: number }> = []
      link.click()
      const startedAt = performance.now()
      await new Promise<void>((resolve) => {
        const record = () => {
          positions.push({ page: scrollY, panel: panel.scrollTop })
          if (performance.now() - startedAt < 1000) requestAnimationFrame(record)
          else resolve()
        }
        requestAnimationFrame(record)
      })
      return positions
    })
    const end = trace.at(-1)
    if (!end) throw new Error('Scroll animation was not sampled')
    expect(end.page).toBeGreaterThan(1000)
    expect(end.panel).toBeGreaterThan(100)
    expect(
      trace.filter((point) => point.page > 5 && point.page < end.page - 5).length,
    ).toBeGreaterThan(3)
    expect(
      trace.filter((point) => point.panel > 5 && point.panel < end.panel - 5).length,
    ).toBeGreaterThan(3)
    await expectAligned(heading(page, 32))
    const panel = page.locator('.article-reader-toc')
    await expect(panel.locator('[aria-current="location"]')).toHaveAttribute(
      'data-toc-link',
      '阅读定位-32',
    )
    await expectCurrentVisible(panel)
    const box = await panel.boundingBox()
    expect(box?.y).toBeGreaterThan(50)
    expect(box?.y).toBeLessThan(120)

    if (reader.name === 'Wiki') {
      const chapters = page.locator('.article-reader-sidebar')
      // Simulate a large document collection without importing extra production content.
      await chapters.locator('ol').evaluate((list) => {
        for (let index = 0; index < 35; index++) {
          const item = document.createElement('li')
          item.textContent = `Fixture chapter ${index}`
          item.style.paddingBlock = '12px'
          list.prepend(item)
        }
      })
      await expectCurrentVisible(chapters)
      expect(await chapters.evaluate((element) => element.scrollTop)).toBeGreaterThan(500)
      await expect(chapters.locator('[aria-current="page"]')).toContainText('C++')
      await expectAligned(heading(page, 32))
    }
  })

  test(`${reader.name} corrects a direct hash after a cold image loads and handles history`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    const image = await holdReaderImage(page)
    try {
      await openReader(page, `${reader.path}#${encodeURIComponent('阅读定位-13')}`)
      // The controller must correct layout shifts even when native browser anchoring cannot.
      await page.evaluate(() => {
        document.documentElement.style.overflowAnchor = 'none'
        document.body.style.overflowAnchor = 'none'
      })
      await page.locator('.prose-site img').evaluateAll((images) => {
        for (const candidate of images) candidate.setAttribute('loading', 'eager')
      })
      await expect.poll(image.started).toBe(true)
      await expectAligned(heading(page, 13))
      image.release()
      await expect(page.getByRole('img', { name: '阅读定位图片' })).toHaveAttribute('height', '900')
      await expectAligned(heading(page, 13))
      await page.locator('.article-reader-toc [data-toc-link="阅读定位-17"]').click()
      await expectAligned(heading(page, 17))
      await page.goBack({ waitUntil: 'domcontentloaded' })
      await expectAligned(heading(page, 13))
      await page.goForward({ waitUntil: 'domcontentloaded' })
      await expectAligned(heading(page, 17))
    } finally {
      image.release()
    }
  })

  test(`${reader.name} respects user scrolling instead of pulling back after image load`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    const image = await holdReaderImage(page)
    try {
      await openReader(page, reader.path)
      await page.locator('.prose-site img').evaluateAll((images) => {
        for (const candidate of images) candidate.setAttribute('loading', 'eager')
      })
      await expect.poll(image.started).toBe(true)
      await page.locator('.article-reader-toc [data-toc-link="阅读定位-13"]').click()
      await expectAligned(heading(page, 13))
      if (reader.name === 'Wiki') await page.keyboard.press('PageDown')
      else {
        await page.mouse.move(700, 500)
        await page.mouse.wheel(0, 700)
      }
      await expect
        .poll(() => heading(page, 13).evaluate((element) => element.getBoundingClientRect().top))
        .toBeLessThan(-300)
      image.release()
      await expect(page.getByRole('img', { name: '阅读定位图片' })).toHaveAttribute('height', '900')
      // Give any erroneous corrective animation enough time to become observable.
      await page.waitForTimeout(800)
      expect(
        await heading(page, 13).evaluate((element) => element.getBoundingClientRect().top),
      ).toBeLessThan(-100)
    } finally {
      image.release()
    }
  })
}

test('TOC browsing pauses automatic following without scrolling the body', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await openReader(page, readers[0].path)
  await heading(page, 32).evaluate((element) =>
    window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 100),
  )
  const panel = page.locator('.article-reader-toc')
  await expectCurrentVisible(panel)
  await expect(panel.locator('[aria-current]')).toHaveAttribute('data-toc-link', '阅读定位-32')
  const original = await page.evaluate(() => scrollY)
  const box = await panel.boundingBox()
  if (!box) throw new Error('TOC panel is missing')
  await page.mouse.move(box.x + 60, box.y + 100)
  await page.mouse.wheel(0, -450)
  await page.waitForTimeout(400)
  const browsed = await panel.evaluate((element) => element.scrollTop)
  await page.waitForTimeout(1700)
  expect(await panel.evaluate((element) => element.scrollTop)).toBeCloseTo(browsed, 0)
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(original, 0)
  await heading(page, 2).evaluate((element) =>
    window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 100),
  )
  await expect(panel.locator('[aria-current]')).toHaveAttribute('data-toc-link', '阅读定位-2')
  await expectCurrentVisible(panel)
})

test('mobile drawers show the reading position and close before smooth navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openReader(page, readers[1].path)
  await heading(page, 20).evaluate((element) =>
    window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 100),
  )
  await page.getByRole('button', { name: '本文目录' }).click()
  const drawer = page.locator('.article-drawer-panel')
  await expect(drawer.locator('[aria-current]')).toHaveAttribute('data-toc-link', '阅读定位-20')
  await expectCurrentVisible(drawer)
  await drawer.locator('[data-toc-link="阅读定位-3"]').click()
  await expect(drawer).toBeHidden()
  await expectAligned(heading(page, 3))
  await page.getByRole('button', { name: '文档章节' }).click()
  await expectCurrentVisible(page.locator('.article-drawer-panel'))
  await expect(page.locator('.article-drawer-panel [aria-current="page"]')).toContainText('C++')
  await page.keyboard.press('Escape')
  await expect(page.locator('.article-drawer-panel')).toBeHidden()
})

test('reduced motion remains immediate and image failures do not prevent navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.route('**/api/assets/fixtures/phase-6.svg', (route) => route.abort())
  await openReader(page, readers[0].path)
  await page.evaluate(() => {
    document.documentElement.style.overflowAnchor = 'none'
    document.body.style.overflowAnchor = 'none'
  })
  await page
    .locator('.article-reader-toc [data-toc-link="阅读定位-13"]')
    .evaluate((link: HTMLAnchorElement) => link.click())
  await expectAligned(heading(page, 13))
  await expectCurrentVisible(page.locator('.article-reader-toc'))
  // Layout changes such as font reflow are handled even without an image load event.
  await heading(page, 13).evaluate((element) => {
    const spacer = document.createElement('div')
    spacer.style.height = '350px'
    element.before(spacer)
  })
  await expectAligned(heading(page, 13))
})
