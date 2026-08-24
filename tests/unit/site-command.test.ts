import { describe, expect, it } from 'vitest'

import { assertToolchain, parseSiteCommand, SiteUsageError } from '../../tools/site-command'

describe('site command boundary', () => {
  it('parses the Phase 1 command surface', () => {
    expect(parseSiteCommand(['check'])).toBe('check')
    expect(parseSiteCommand(['test'])).toBe('test')
    expect(parseSiteCommand([])).toBe('help')
  })

  it('rejects unknown or ambiguous commands', () => {
    expect(() => parseSiteCommand(['deploy'])).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['check', 'extra'])).toThrow(SiteUsageError)
  })

  it('pins the Node.js runtime', () => {
    expect(() => assertToolchain('24.19.0')).not.toThrow()
    expect(() => assertToolchain('22.23.1')).toThrow(SiteUsageError)
  })
})
