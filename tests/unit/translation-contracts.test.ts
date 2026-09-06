import { describe, expect, it } from 'vitest'

import { translationOperationRequestSchema } from '../../src/translation/contracts'

describe('translation operation contract', () => {
  it('keeps dry-run cost free and requires explicit execution confirmation', () => {
    expect(
      translationOperationRequestSchema.parse({
        force: false,
        mode: 'dry-run',
        scope: 'pending',
      }),
    ).toMatchObject({ mode: 'dry-run', scope: 'pending' })
    expect(() =>
      translationOperationRequestSchema.parse({
        budgetUsd: 1,
        force: false,
        mode: 'execute',
        scope: 'pending',
      }),
    ).toThrow()
  })

  it('requires a source path for article scope and stronger force confirmation', () => {
    expect(() =>
      translationOperationRequestSchema.parse({ force: false, mode: 'dry-run', scope: 'article' }),
    ).toThrow()
    expect(() =>
      translationOperationRequestSchema.parse({
        force: true,
        mode: 'dry-run',
        scope: 'all',
      }),
    ).toThrow()
    expect(
      translationOperationRequestSchema.parse({
        force: true,
        mode: 'dry-run',
        retranslationConfirmation: 'RETRANSLATE',
        scope: 'all',
      }),
    ).toMatchObject({ force: true })
  })
})
