export const placeholderKinds = ['integration', 'migration', 'e2e'] as const

export type PlaceholderKind = (typeof placeholderKinds)[number]

export type PlaceholderPolicy = Readonly<{
  owner: 'Repository Owner'
  replacementPhase: 2 | 3 | 6
  scope: string
  status: 'NOT_IMPLEMENTED'
}>

export const placeholderPolicies: Readonly<Record<PlaceholderKind, PlaceholderPolicy>> = {
  integration: {
    owner: 'Repository Owner',
    replacementPhase: 2,
    scope: 'Disposable PostgreSQL and S3Mock integration suite',
    status: 'NOT_IMPLEMENTED',
  },
  migration: {
    owner: 'Repository Owner',
    replacementPhase: 3,
    scope: 'Database migration suite after the first versioned schema exists',
    status: 'NOT_IMPLEMENTED',
  },
  e2e: {
    owner: 'Repository Owner',
    replacementPhase: 6,
    scope: 'Affected critical-flow Playwright suite after the first website vertical slice exists',
    status: 'NOT_IMPLEMENTED',
  },
}
