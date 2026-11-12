import { describe, expect, it } from 'vitest'
import { planReleaseCompatibility } from '../../tools/deployment/release-preflight'

const v13 = Array.from({ length: 14 }, (_, i) => `${String(i).padStart(4, '0')}_fixture`)
const v15 = [...v13, '0014_private_body_measurements', '0015_health_sync_job']
const policy = {
  migrations: [
    {
      tag: '0014_private_body_measurements',
      requiresHealthCompatiblePreviousRelease: true,
    },
    { tag: '0015_health_sync_job' },
  ],
}

describe('release source compatibility preflight', () => {
  it('blocks new private health migration until active release can read private records', () => {
    expect(
      planReleaseCompatibility(
        v13,
        v15,
        policy,
        { health: false, tech: true },
        { health: true, tech: true },
      ).missing,
    ).toEqual(['0014_private_body_measurements'])
  })

  it('allows a verified compatibility bridge to precede an expanded release', () => {
    expect(
      planReleaseCompatibility(
        v13,
        v15,
        policy,
        { health: true, tech: true },
        { health: true, tech: true },
      ).missing,
    ).toEqual([])
  })

  it('rejects rollback to an unsafe old release after private migration', () => {
    expect(
      planReleaseCompatibility(
        v15,
        v13,
        policy,
        { health: true, tech: true },
        { health: false, tech: true },
      ).missing,
    ).toEqual(['0014_private_body_measurements'])
  })

  it('does not require special migration bridges for an additive nonbreaking change', () => {
    expect(
      planReleaseCompatibility(
        v15,
        [...v15, '0016_additive_table'],
        policy,
        { health: true, tech: true },
        { health: true, tech: true },
      ).missing,
    ).toEqual([])
  })
})
