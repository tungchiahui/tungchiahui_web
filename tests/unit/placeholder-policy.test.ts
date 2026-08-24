import { describe, expect, it } from 'vitest'

import { placeholderPolicies } from '../../tools/quality/placeholder-policy'

describe('temporary test placeholders', () => {
  it('cannot be represented as passing suites', () => {
    expect(
      Object.values(placeholderPolicies).every((policy) => policy.status === 'NOT_IMPLEMENTED'),
    ).toBe(true)
  })

  it('assigns an owner and replacement phase to every placeholder', () => {
    expect(placeholderPolicies.integration).toMatchObject({
      owner: 'Repository Owner',
      replacementPhase: 2,
    })
    expect(placeholderPolicies.migration).toMatchObject({
      owner: 'Repository Owner',
      replacementPhase: 3,
    })
    expect(placeholderPolicies.e2e).toMatchObject({
      owner: 'Repository Owner',
      replacementPhase: 6,
    })
  })
})
