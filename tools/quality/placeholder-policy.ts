export const placeholderKinds = ['e2e'] as const

export type PlaceholderKind = (typeof placeholderKinds)[number]

export type PlaceholderPolicy = Readonly<{
  owner: 'Repository Owner'
  replacementPhase: 6
  scope: string
  status: 'NOT_IMPLEMENTED'
}>

export const placeholderPolicies: Readonly<Record<PlaceholderKind, PlaceholderPolicy>> = {
  e2e: {
    owner: 'Repository Owner',
    replacementPhase: 6,
    scope: 'Affected critical-flow Playwright suite after the first website vertical slice exists',
    status: 'NOT_IMPLEMENTED',
  },
}
