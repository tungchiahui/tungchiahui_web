import { expect, test } from '@playwright/test'

test('long chapter numbers keep their own width and a visible title gap on narrow screens', async ({
  page,
}) => {
  await page.goto('/wiki')
  const card = page.locator('.wiki-document-card').first()
  if ((await card.getAttribute('open')) === null) await card.locator('summary').click()
  const link = card.locator('.wiki-document-chapters a').first()
  await expect(link).toBeVisible()
  // Stress the real production row/CSS without expanding the canonical development corpus.
  await link.evaluate((element) => {
    const number = element.querySelector('.wiki-chapter-number')
    const title = element.querySelector('span:last-child')
    if (number) number.textContent = '12.4.3.3'
    if (title) title.textContent = '持续任务与中止 BehaviorTreeReallyLongIdentifierWithoutSpaces'
  })
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await link.evaluate((element) => {
      const number = element.querySelector('.wiki-chapter-number')?.getBoundingClientRect()
      const title = element.querySelector('span:last-child')?.getBoundingClientRect()
      const row = element.getBoundingClientRect()
      return {
        gap: (title?.left ?? 0) - (number?.right ?? 0),
        titleRight: title?.right ?? 0,
        rowRight: row.right,
        overflow: element.scrollWidth > element.clientWidth,
      }
    })
    expect(layout.gap).toBeGreaterThanOrEqual(8)
    expect(layout.titleRight).toBeLessThanOrEqual(layout.rowRight)
    expect(layout.overflow).toBe(false)
  }
})
