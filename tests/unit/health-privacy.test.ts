import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createAccountHttpHandler } from '../../src/control-plane/account-http'

const token = 'a'.repeat(64)
describe('health privacy compatibility boundary', () => {
  for (const role of [undefined, 'user', 'owner'] as const) {
    it(`requires owner role for legacy private health reads (${role})`, async () => {
      const handler = createAccountHttpHandler(
        { mode: 'test' } as never,
        {
          current: async () => (role ? { id: 'test', username: 'test', role } : undefined),
          findAccount: async () => undefined,
          createSession: async () => token,
          revoke: async () => {},
          readStart: async () => undefined,
          updateStart: async () => undefined,
        },
        null,
        {
          read: async () => ({
            migrated: false,
            dataset: { payload: { version: 2, records: [] }, revision: 0 },
          }),
        },
      )
      const result = await handler(
        '/api/ops/health/legacy',
        'GET',
        new Headers({ cookie: `site_session=${token}` }),
        new Uint8Array(),
      )
      expect(result.status).toBe(role === 'owner' ? 200 : 403)
    })
  }
  it('keeps public SSR independent of health persistence', () => {
    const source = readFileSync('src/web/public-page.tsx', 'utf8')
    expect(source).not.toContain("readCachedOwnerDataset('weight_loss')")
    const api = readFileSync('src/app/api/personal-data/[dataset]/route.ts', 'utf8')
    expect(api.indexOf("parsed.data === 'weight_loss'")).toBeLessThan(
      api.indexOf('readOwnerDataset'),
    )
  })
})
