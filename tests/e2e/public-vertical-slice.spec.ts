import { readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { expect, test } from '@playwright/test'

const repositoryRoot = resolve(import.meta.dirname, '../..')

function ros2HtmlRoutes() {
  const root = resolve(repositoryRoot, 'public/docs/ros2')
  const routes: string[] = []
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name.endsWith('.html')) {
        routes.push(`/${relative(resolve(repositoryRoot, 'public'), path).split(sep).join('/')}`)
      }
    }
  }
  visit(root)
  return routes.toSorted()
}

test('renders homepage and PostgreSQL-backed Blog/Wiki surfaces in both zh-CN route forms', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '你好，我是 TungChiaHui。' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'VSCode 任务栏启动 Codex 插件打不开' })).toBeVisible()

  await page.goto('/zh-cn')
  await expect(page.getByRole('heading', { name: '你好，我是 TungChiaHui。' })).toBeVisible()

  await page.goto('/blog')
  await expect(page.getByRole('heading', { name: '博客', exact: true })).toBeVisible()
  await page.goto('/zh-cn/wiki')
  await expect(page.getByRole('heading', { name: 'Wiki', exact: true })).toBeVisible()
})

test('routes all approved locales, preserves logical switching and exposes content state', async ({
  page,
}) => {
  const route = '/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi'

  await page.goto(`/zh-hk${route}`)
  await expect(page.getByRole('heading', { name: 'C++ 開發環境搭建與測試' })).toBeVisible()
  await expect(page.locator('[data-content-locale-state="converted"]')).toContainText('確定性轉換')
  await expect(page.locator('[data-locale-switch] a[hreflang="en-us"]')).toHaveAttribute(
    'href',
    `/en-us${route}`,
  )

  await page.goto(`/zh-tw${route}`)
  await expect(page.getByRole('heading', { name: 'C++ 開發環境搭建與測試' })).toBeVisible()
  await expect(page).toHaveTitle(/C\+\+ 開發環境搭建與測試/)

  await page.goto(`/en-us${route}`)
  await expect(page.getByRole('heading', { name: 'C++ 开发环境搭建与测试' })).toBeVisible()
  await expect(page.locator('[data-content-locale-state="fallback"]')).toContainText(
    'latest Simplified Chinese source',
  )
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'href',
    '/en-us',
  )

  await page.goto('/en-us/blog/2026-01-06-xin-bo-ke-qi-yong')
  await expect(page.getByRole('heading', { name: 'New blog enabled' })).toBeVisible()
  await expect(page.getByText('Revalidated without rebuilding.')).toBeVisible()
  await expect(page.locator('[data-content-locale-state="mixed"]')).toContainText(
    '1 current source blocks remain',
  )

  for (const locale of ['zh-cn', 'zh-hk', 'zh-tw', 'en-us']) {
    const response = await page.goto(`/${locale}/blog`)
    expect(response?.status(), locale).toBe(200)
  }
})

test('keeps removed zh-hant routes negative without redirect', async ({ page }) => {
  for (const route of ['/zh-hant', '/zh-hant/blog', '/zh-hant/wiki/docker-tutorial']) {
    const response = await page.goto(route)
    expect(response?.status(), route).toBe(404)
    expect(new URL(page.url()).pathname).toBe(route)
  }
})

test('preserves exact Legacy article, Pinyin and approved alias routes', async ({ page }) => {
  for (const route of [
    '/blog/2026-01-06-xin-bo-ke-qi-yong',
    '/blog/2026-01-14-w311mi-ax300-qu-dong',
    '/blog/2026-02-09-xin-de-todolist-jie-mian',
    '/blog/2026-07-21-vscode-ren-wu-lan-qi-dong-codex-cha-jian-da-bu-kai',
    '/blog/newblogenable!',
    '/blog/w311mi_ax300',
    '/blog/newtodolist',
    '/blog/vscode-taskbar-codex-fix',
    '/wiki/docker-tutorial',
    '/zh-cn/wiki/docker-tutorial',
    '/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
  ]) {
    const response = await page.goto(route)
    expect(response?.status(), route).toBe(200)
  }
  await expect(page.getByRole('heading', { name: 'C++ 开发环境搭建与测试' })).toBeVisible()
})

test('renders safe runtime Markdown, Shiki, anchors, links, images and Unicode', async ({
  page,
}) => {
  const response = await page.goto(
    '/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
  )
  expect(response?.status()).toBe(200)
  await expect(page.locator('code').filter({ hasText: 'ROS2_Control' })).toBeVisible()
  await expect(page.locator('pre.shiki')).toContainText('int main() { return 0; }')
  await expect(page.locator('h2#代码示例')).toBeVisible()
  await expect(page.getByRole('link', { name: 'ROS2 文档' })).toHaveAttribute(
    'href',
    '/docs/ros2/core/index.html',
  )
  const image = page.getByRole('img', { name: '本地 S3Mock Fixture' })
  await expect(image).toHaveAttribute('loading', 'lazy')
  await expect(image).toHaveAttribute('data-asset-origin', 'local')
  const assetResponse = await page.request.get('/api/assets/fixtures/phase-6.svg')
  expect(assetResponse.status()).toBe(200)
  expect(assetResponse.headers()['content-type']).toContain('image/svg+xml')
})

test('keeps all Phase 0 ROS2 HTML routes publicly readable', async ({ request }) => {
  const routes = ros2HtmlRoutes()
  expect(routes).toHaveLength(311)
  for (let index = 0; index < routes.length; index += 20) {
    const batch = routes.slice(index, index + 20)
    const responses = await Promise.all(batch.map((route) => request.get(route)))
    for (const [offset, response] of responses.entries()) {
      expect(response.status(), batch[offset]).toBe(200)
    }
  }
})

test('searches PostgreSQL + PGroonga by locale without shipping the corpus to the browser', async ({
  page,
  request,
}) => {
  await page.goto('/search?q=ROS2_Control')
  await expect(page.getByRole('heading', { name: '站内搜索' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'C++ 开发环境搭建与测试' })).toHaveAttribute(
    'href',
    '/zh-cn/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
  )
  await expect(page.locator('[data-search-results]')).toContainText('正文匹配')

  await page.goto('/en-us/search?q=New%20blog%20enabled')
  await expect(page.getByRole('heading', { name: 'Site search' })).toBeVisible()
  await expect(page.locator('a[href="/en-us/blog/2026-01-06-xin-bo-ke-qi-yong"]')).toBeVisible()

  const api = await request.get('/api/search?q=Docker%20教程&locale=zh-cn')
  expect(api.status()).toBe(200)
  expect(api.headers()['cache-control']).toBe('no-store')
  const response = await api.json()
  expect(response.results[0]).toMatchObject({
    locale: 'zh-cn',
    route: '/zh-cn/wiki/2024-10-03-docker-jiao-cheng',
    title: 'Docker 教程',
  })
  expect(JSON.stringify(response)).not.toContain('rawMarkdown')

  const scripts = await page
    .locator('script[src]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute('src'))
        .filter((value): value is string => Boolean(value)),
    )
  const clientBundles = await Promise.all(
    scripts.map((source) => page.request.get(source).then((bundle) => bundle.text())),
  )
  expect(clientBundles.join('\n')).not.toContain('Revalidated without rebuilding.')
})

test('keeps special pages, local Start interaction and public datasets available', async ({
  page,
}) => {
  for (const route of [
    '/about',
    '/cv',
    '/friend',
    '/more',
    '/music',
    '/mylogo',
    '/start',
    '/stats',
    '/tech-footprint',
    '/weight-loss',
  ]) {
    const response = await page.goto(route)
    expect(response?.status(), route).toBe(200)
  }

  await page.goto('/start')
  await page.getByPlaceholder('名称').fill('Example')
  await page.getByPlaceholder('网址').fill('https://example.com/')
  await page.getByRole('button', { name: '添加书签' }).click()
  await expect(page.getByRole('link', { name: 'Example' })).toBeVisible()

  await page.goto('/tech-footprint')
  await expect(page.getByText('y1a/cpp-linux/cpp')).toBeVisible()
})

test('returns observable health, readiness, version and not-found semantics', async ({
  page,
  request,
}) => {
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  expect(await health.json()).toEqual({ service: 'web', status: 'ok' })
  expect(health.headers()['cache-control']).toBe('no-store')

  const ready = await request.get('/api/ready')
  expect(ready.status()).toBe(200)
  expect(await ready.json()).toEqual({ dependencies: { postgresql: 'ready' }, status: 'ready' })

  const version = await request.get('/api/version')
  expect(version.status()).toBe(200)
  expect(await version.json()).toMatchObject({ deployment: 'development-stub', service: 'web' })

  const missing = await page.goto('/route-that-does-not-exist')
  expect(missing?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: '没有找到这个页面' })).toBeVisible()
})

test('derives article metadata and excludes server secrets from client bundles', async ({
  page,
}) => {
  await page.goto('/blog/2026-02-09-xin-de-todolist-jie-mian')
  await expect(page).toHaveTitle(/新的 todolist 界面/)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    '新的 todolist 界面',
  )

  const scripts = await page
    .locator('script[src]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute('src'))
        .filter((value): value is string => Boolean(value)),
    )
  const bundles = await Promise.all(
    scripts.map((source) => page.request.get(source).then((response) => response.text())),
  )
  const clientSource = bundles.join('\n')
  expect(clientSource).not.toContain('local-only-phase6-revalidation-secret')
  expect(clientSource).not.toContain('local-only-secret-key')
  expect(clientSource).not.toContain('postgresql://tungchiahui:')
})
