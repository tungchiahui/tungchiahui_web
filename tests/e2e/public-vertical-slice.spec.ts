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
  await expect(page.getByRole('heading', { name: '本站内容方向' })).toBeVisible()
  await expect(page.getByRole('link', { name: '浏览博客文章' })).toHaveAttribute('href', '/blog')
  await expect(page.locator('.home-focus article')).toHaveCount(6)
  const homepageWikiDocuments = page.locator('[data-wiki-document="home"]')
  await expect(homepageWikiDocuments).toHaveCount(3)
  await expect(homepageWikiDocuments.nth(0)).toContainText('Docker 教程')
  await expect(homepageWikiDocuments.nth(1)).toContainText('Boost Aiso')
  await expect(homepageWikiDocuments.nth(2)).toContainText('C++ 开发环境搭建与测试')
  await expect(page.getByRole('link', { name: 'VSCode 任务栏启动 Codex 插件打不开' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'TungChiaHui' }).locator('img')).toHaveAttribute(
    'src',
    '/favicon.ico',
  )

  await page.goto('/zh-cn')
  await expect(page.getByRole('heading', { name: '你好，我是 TungChiaHui。' })).toBeVisible()

  await page.goto('/blog')
  await expect(page.getByRole('heading', { name: '博客', exact: true })).toBeVisible()
  await expect(page.locator('time').first()).toContainText(/^\d{4}-\d{2}-\d{2}$/)
  await page.getByRole('searchbox', { name: '搜索博客标题和内容' }).fill('todolist')
  await page.getByRole('button', { name: '搜索' }).click()
  await expect(page).toHaveURL(/\/blog\?q=todolist/)
  await expect(page.getByRole('link', { name: /新的 todolist 界面/ })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索博客标题和内容' }).fill('Revalidated')
  await page.getByRole('button', { name: '搜索' }).click()
  await expect(page.getByText('正文匹配')).toBeVisible()
  await page.goto('/zh-cn/wiki')
  await expect(page.getByRole('heading', { name: 'Wiki', exact: true })).toBeVisible()
  await expect(page.locator('details').first()).toContainText(/章/)
  await page.getByRole('searchbox', { name: '搜索 Wiki 标题和内容' }).fill('ROS2_Control')
  await page.getByRole('button', { name: '搜索' }).click()
  await expect(page.getByText('正文匹配').first()).toBeVisible()
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
  await page.setViewportSize({ height: 900, width: 1600 })
  await page.route('**/api/traffic', (route) =>
    route.fulfill({
      body: JSON.stringify({
        averageVisitSeconds: 42,
        bounceRate: 0.25,
        pageviews: 12,
        status: 'available',
        visits: 8,
      }),
      contentType: 'application/json',
      status: 200,
    }),
  )
  const response = await page.goto(
    '/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
  )
  expect(response?.status()).toBe(200)
  await expect(page.locator('code').filter({ hasText: 'ROS2_Control' })).toBeVisible()
  await expect(page.locator('pre.shiki')).toContainText('int main() { return 0; }')
  await expect(page.locator('.code-language').first()).toHaveText('CPP')
  await expect(page.getByRole('button', { name: '复制' })).toBeVisible()
  await page.getByRole('button', { name: '复制' }).click()
  await expect(page.getByRole('button', { name: '已复制' })).toBeVisible()
  await expect(page.locator('h2#代码示例')).toBeVisible()
  await expect(page.locator('h1#c-与-unicode-渲染 > .heading-number')).toHaveText('1.')
  await expect(page.locator('h2#代码示例 > .heading-number')).toHaveText('1.1.')
  await expect(page.locator('h2#代码示例')).toHaveAttribute('data-heading-anchor', '')
  await page.locator('h2#代码示例').click()
  await expect(page).toHaveURL(/#%E4%BB%A3%E7%A0%81%E7%A4%BA%E4%BE%8B$/)
  await expect(page.getByRole('link', { name: 'ROS2 文档' })).toHaveAttribute(
    'href',
    '/docs/ros2/core/index.html',
  )
  const image = page.getByRole('img', { name: '本地 S3Mock Fixture' })
  await expect(image).toHaveAttribute('loading', 'lazy')
  await expect(image).toHaveAttribute('data-asset-origin', 'local')
  await image.click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible()
  await page.getByRole('dialog', { name: '图片预览' }).getByRole('img').click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeHidden()
  await expect(page.locator('[data-wiki-document-navigation]').first()).toBeVisible()
  await expect(page.locator('[data-reading-progress]')).toBeAttached()
  const articleWidth = await page.locator('.prose-site').evaluate((element) => element.clientWidth)
  expect(articleWidth).toBeGreaterThan(850)
  await expect(page.locator('[data-traffic-metrics]')).toContainText('浏览量12')
  const assetResponse = await page.request.get('/api/assets/fixtures/phase-6.svg')
  expect(assetResponse.status()).toBe(200)
  expect(assetResponse.headers()['content-type']).toContain('image/svg+xml')
})

test('keeps mobile primary navigation and Wiki document/TOC drawers usable', async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await page.goto('/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi')
  const playerBox = await page.getByTestId('music-player').boundingBox()
  expect(playerBox).not.toBeNull()
  if (playerBox) expect(844 - (playerBox.y + playerBox.height)).toBeLessThanOrEqual(24)
  const readerToolsBox = await page.locator('.article-mobile-tools').boundingBox()
  expect(readerToolsBox).not.toBeNull()
  if (playerBox && readerToolsBox) {
    expect(readerToolsBox.x + readerToolsBox.width).toBeLessThanOrEqual(playerBox.x + 1)
  }
  await page.getByRole('button', { name: '菜单' }).click()
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.locator('[data-mobile-menu-backdrop]').click({ position: { x: 10, y: 400 } })
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeHidden()
  const headerButtons = await page.locator('header a[aria-label="搜索"], header button').all()
  expect(headerButtons).toHaveLength(3)
  await page.getByRole('button', { name: '主题模式' }).click()
  await expect(page.getByRole('menuitemradio', { name: '跟随系统/浏览器' })).toBeVisible()
  await page.getByRole('menuitemradio', { name: '深色模式' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: '文档章节' }).click()
  await expect(page.locator('[data-reader-drawer]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-reader-drawer]')).toBeHidden()
  await page.getByRole('button', { name: '本文目录' }).click()
  await expect(page.locator('[data-reader-drawer]')).toContainText('代码示例')
  await expect(page.locator('[data-reader-drawer] [data-toc-link]').first()).toContainText(/^1\./)
  await expect(page.locator('.article-mobile-tools')).toHaveCSS('position', 'fixed')
  const drawer = await page.locator('.article-drawer-panel').boundingBox()
  expect(drawer).not.toBeNull()
  if (!drawer) throw new Error('Reader dialog is missing')
  expect(Math.abs(drawer.y + drawer.height / 2 - 422)).toBeLessThan(30)
  await page.locator('[data-reader-drawer] [data-toc-link]').first().click()
  await expect(page.locator('[data-reader-drawer]')).toBeHidden()

  await page.locator('.prose-site').evaluate((element) => {
    const longValue = 'mobile-content-must-scroll-inside-its-own-region-'.repeat(8)
    element.insertAdjacentHTML(
      'beforeend',
      `<div class="table-scroll" data-overflow-test="table"><table><tbody><tr>${Array.from({ length: 8 }, (_, index) => `<td>宽表格第${index + 1}列-${longValue}</td>`).join('')}</tr></tbody></table></div><div class="code-block" data-overflow-test="code"><pre><code>${longValue}</code></pre></div>`,
    )
  })
  const tableOverflow = await page.locator('[data-overflow-test="table"]').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  const codeOverflow = await page
    .locator('[data-overflow-test="code"] pre')
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
  expect(tableOverflow.scrollWidth).toBeGreaterThan(tableOverflow.clientWidth)
  expect(codeOverflow.scrollWidth).toBeGreaterThan(codeOverflow.clientWidth)
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth)
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

  await page.goto('/search?q=ROS2_Control&type=blog')
  await expect(page.getByRole('combobox', { name: '内容类型' })).toHaveValue('blog')
  await expect(page.getByText('当前语言中没有找到相关内容。')).toBeVisible()

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
  await page.route('**/api/music/playlist', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'fixture-song',
          title: '测试歌曲',
          artist: '测试歌手',
          cover: '',
          lyricSource: '[00:00]测试歌词',
          url: 'https://cdn.tungchiahui.cn/music/fixture.mp3',
          selfHosted: true,
        },
      ]),
    })
  })
  await page.route('**/api/start/backgrounds', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          copyright: '测试摄影师',
          title: 'Bing 测试壁纸',
          url: 'https://www.bing.com/th?id=OHR.Test_ZH-CN_1920x1080.jpg&pid=hp',
        },
      ]),
    })
  })
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
    const response = await page.request.get(route)
    expect(response.status(), route).toBe(200)
  }

  await page.route('**/api/stats', (route) =>
    route.fulfill({ body: JSON.stringify({ error: 'fixture_unavailable' }), status: 503 }),
  )
  await page.goto('/stats')
  await expect(page.getByRole('link', { name: '在 Umami 中打开' })).toHaveAttribute(
    'href',
    'https://umami.tungchiahui.cn/share/rCG6EZoHmlCmNnWn',
  )
  await expect(page.locator('iframe')).toHaveCount(0)

  await page.goto('/start')
  await expect(page.getByText(/Bing 每日图片 · Bing 测试壁纸/)).toBeVisible()
  await expect(page.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/')
  await expect(page.locator('body > div > header')).toHaveCount(0)
  const startSize = await page.locator('.start-workspace').boundingBox()
  const viewport = page.viewportSize()
  expect(startSize?.height).toBeGreaterThanOrEqual(viewport?.height ?? 0)
  expect(startSize?.width).toBeGreaterThanOrEqual(viewport?.width ?? 0)
  await page.getByRole('button', { name: '完整' }).click()
  await page.getByRole('button', { name: '编辑书签' }).click()
  await page.getByPlaceholder('名称').first().fill('Example')
  await page.getByPlaceholder('网址', { exact: true }).first().fill('https://example.com/')
  await page.getByRole('button', { name: '添加书签' }).first().click()
  await expect(page.getByRole('link', { name: 'Example' })).toBeVisible()

  await page.goto('/tech-footprint')
  await expect(
    page.getByRole('heading', { name: '掌握 RAII、智能指针、移动语义、常用 STL 与错误处理' }),
  ).toBeVisible()

  await page.goto('/more')
  await expect(page.getByRole('link', { name: /Umami 数据共享页/ })).toHaveAttribute(
    'href',
    'https://umami.tungchiahui.cn/share/rCG6EZoHmlCmNnWn',
  )
  await expect(page.getByText('https://global.cdn.tungchiahui.cn')).toBeVisible()

  await page.goto('/music')
  await expect(page.getByRole('heading', { name: '测试歌曲' })).toBeVisible()
  await expect(page.getByText('测试歌词').first()).toBeVisible()
  const floatingPlayer = page.getByTestId('music-player')
  await floatingPlayer.getByRole('button', { name: '播放列表' }).click()
  await expect(floatingPlayer.getByRole('list')).toContainText('测试歌曲')
  await page.getByRole('button', { name: '收起音乐播放器' }).click()
  await expect(page.getByTestId('music-mini-player')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('music-mini-player')).toBeVisible()
  await expect(page.locator('footer').getByRole('link', { name: 'GitHub' })).toBeVisible()
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
