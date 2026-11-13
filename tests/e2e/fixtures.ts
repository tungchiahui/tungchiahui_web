import { test as base } from '@playwright/test'

export * from '@playwright/test'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nMAAAAAASUVORK5CYII=',
  'base64',
)
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('https://www.bing.com/th?**', (route) =>
      route.fulfill({ body: pixel, contentType: 'image/png' }),
    )
    await context.route('https://umami.tungchiahui.cn/**', (route) =>
      route.fulfill({ body: '', contentType: 'application/javascript' }),
    )
    await use(context)
  },
})
