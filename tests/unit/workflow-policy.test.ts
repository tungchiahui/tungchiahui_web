import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { analyzeWorkflowPolicies } from '../../tools/ci/workflow-policy'

describe('Phase 15 workflow trigger and credential separation', () => {
  it('keeps Quality, Application, Content and Translation automation hard-gated and separate', () => {
    expect(analyzeWorkflowPolicies(resolve(process.cwd()))).toEqual([])
  })
})
