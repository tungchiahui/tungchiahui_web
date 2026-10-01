import { expect, test } from '@playwright/test'

test('compatibility bridge serves the public roadmap while keeping Tech editing disabled', async ({
  page,
}) => {
  await page.goto('/tech-footprint')
  await expect(page.getByRole('heading', { name: '机器人系统软件研究生成长路线' })).toBeVisible()
  await expect(page.getByRole('button', { name: '研三下', exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton').first()).toBeDisabled()
  await expect(page.getByRole('button', { name: '编辑路线图' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.goto('/weight-loss')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('用户名').fill('owner')
  await dialog.getByLabel('密码').fill('local-only-owner-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '7 日平均体重 (kg)' })).toBeEnabled()
})
