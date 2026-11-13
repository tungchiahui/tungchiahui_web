// Loaded exclusively by the disposable test Compose web process.
if (process.env.SITE_RUNTIME_MODE !== 'test') throw new Error('External fixtures require test mode')
const upstreamFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString())
  if (url.hostname === 'umami.tungchiahui.cn') {
    if (url.pathname.startsWith('/api/share/'))
      return Response.json({
        token: 'isolated-analytics-fixture',
        websiteId: '993e907c-7120-4da5-9eaf-85a914ffbc9c',
      })
    if (url.pathname.endsWith('/stats'))
      return Response.json({ bounces: 0, pageviews: 0, totaltime: 0, visitors: 0, visits: 0 })
    if (url.pathname.endsWith('/metrics/expanded')) return Response.json([])
    return new Response('', { status: 404 })
  }
  if (url.hostname === 'www.bing.com' && url.pathname === '/HPImageArchive.aspx')
    return Response.json({
      images: [
        {
          copyright: '隔离测试摄影师',
          title: '隔离测试壁纸',
          url: '/th?id=OHR.Fixture_ZH-CN_1920x1080.jpg&pid=hp',
        },
      ],
    })
  return upstreamFetch(input, init)
}

export {}
