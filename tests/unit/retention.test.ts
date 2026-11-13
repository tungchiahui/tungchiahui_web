import { describe, expect, it, vi } from 'vitest'

import type {
  InfrastructureOperation,
  RecoveryBackupRecord,
} from '../../src/control-plane/control-state'
import {
  planBackupRetention,
  planDockerRetention,
  retentionPolicy,
} from '../../src/maintenance/retention'
import {
  type GhcrPackageVersion,
  manifestComponentReferences,
  planGhcrRetention,
  retainedComponentReferences,
} from '../../tools/maintenance/ghcr-retention'

function backup(
  backupId: string,
  backupType: RecoveryBackupRecord['backupType'],
  completedAt: string,
): RecoveryBackupRecord {
  return {
    backupId,
    backupType,
    completedAt,
    createdAt: completedAt,
    manifestSha256: 'a'.repeat(64),
    measuredBytes: 1,
    measuredSeconds: 1,
    offsiteReplicaStatus: 'fresh',
    primaryReplicaStatus: 'fresh',
    repositoryGeneration: backupId,
    retiredAt: null,
    stanza: 'tungchiahui',
    valid: true,
    walArchiveMax: '000000010000000000000001',
  }
}

function ghcrVersion(id: number, sha: string, createdAt: string): GhcrPackageVersion {
  return {
    created_at: createdAt,
    id,
    metadata: { container: { tags: [sha] } },
    name: `sha256:${'a'.repeat(64)}`,
  }
}

describe('audited retention policy', () => {
  it('keeps 90 days and the newest four verified Full chains', () => {
    const records = [
      backup('20260101-000000F', 'full', '2026-01-01T00:00:00.000Z'),
      backup('20260201-000000F', 'full', '2026-02-01T00:00:00.000Z'),
      backup('20260301-000000F', 'full', '2026-03-01T00:00:00.000Z'),
      backup('20260401-000000F', 'full', '2026-04-01T00:00:00.000Z'),
      backup('20260501-000000F', 'full', '2026-05-01T00:00:00.000Z'),
      backup('20260501-000000F_20260502-000000D', 'diff', '2026-05-02T00:00:00.000Z'),
      backup('20260920-000000F', 'full', '2026-09-20T00:00:00.000Z'),
    ]
    const planned = planBackupRetention(records, [], new Date('2026-09-23T00:00:00.000Z'))
    expect(planned.protectedFullChains).toEqual([
      '20260920-000000F',
      '20260501-000000F',
      '20260401-000000F',
      '20260301-000000F',
    ])
    expect(planned.candidates.map((record) => record.backupId)).toEqual([
      '20260101-000000F',
      '20260201-000000F',
    ])
  })

  it('fails closed for backup deletion while another recovery operation is incomplete', () => {
    const operation = {
      id: '11111111-1111-4111-8111-111111111111',
      operationType: 'restore',
      status: 'running',
    } as InfrastructureOperation
    const planned = planBackupRetention(
      [
        backup('20260101-000000F', 'full', '2026-01-01T00:00:00.000Z'),
        backup('20260201-000000F', 'full', '2026-02-01T00:00:00.000Z'),
        backup('20260301-000000F', 'full', '2026-03-01T00:00:00.000Z'),
        backup('20260401-000000F', 'full', '2026-04-01T00:00:00.000Z'),
      ],
      [operation],
      new Date('2026-09-23T00:00:00.000Z'),
    )
    expect(planned.blockedReason).toContain('restore')
    expect(planned.candidates).toEqual([])
  })

  it('protects every container image and the newest five project releases on the host', () => {
    const repository = 'ghcr.io/tungchiahui/tungchiahui_web'
    const shas = Array.from({ length: 7 }, (_, index) => String(index + 1).repeat(40))
    const images = shas.map((sha, index) => ({
      Created: index + 1,
      Id: `sha256:${String(index + 1).repeat(64)}`,
      RepoTags: [`${repository}:${sha}`],
    }))
    const planned = planDockerRetention(
      images,
      [{ ImageID: images[0]?.Id }],
      [repository, `${repository}-postgres`, `${repository}-recovery`, `${repository}-service`],
      [],
    )
    expect(planned.protectedReleaseShas).toHaveLength(retentionPolicy.dockerReleaseCount)
    expect(planned.delete.map((image) => image.releaseShas[0])).toEqual([shas[1]])
  })

  it('deletes GHCR versions only after 30 days and outside the newest 20 releases', () => {
    const old = Array.from({ length: 22 }, (_, index) =>
      ghcrVersion(
        index + 1,
        index.toString(16).padStart(40, '0'),
        new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      ),
    )
    const plan = planGhcrRetention({ tungchiahui_web: old }, new Date('2026-09-23T00:00:00.000Z'))
    expect(plan.protectedReleaseShas).toHaveLength(retentionPolicy.ghcrReleaseCount)
    expect(plan.delete.map((version) => version.versionId)).toEqual([1, 2])
  })

  it('protects old components referenced by a retained Web manifest', () => {
    const old = Array.from({ length: 22 }, (_, index) =>
      ghcrVersion(
        index + 1,
        index.toString(16).padStart(40, '0'),
        new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      ),
    )
    const reference = `tungchiahui_web-service@sha256:${'a'.repeat(64)}`
    const plan = planGhcrRetention(
      {
        tungchiahui_web: old,
        'tungchiahui_web-service': [ghcrVersion(99, 'b'.repeat(40), '2025-01-01T00:00:00.000Z')],
      },
      new Date('2026-09-23T00:00:00.000Z'),
      [reference],
    )
    expect(plan.delete.some((entry) => entry.packageName === 'tungchiahui_web-service')).toBe(false)
    expect(
      manifestComponentReferences({
        'cn.tungchiahui.release.service-digest': `sha256:${'a'.repeat(64)}`,
      }),
    ).toEqual([reference])
    expect(() =>
      manifestComponentReferences({ 'cn.tungchiahui.release.service-digest': 'invalid' }),
    ).toThrow()
  })

  it('keeps host-pinned PostgreSQL versions outside generic Web image cleanup', () => {
    const old = Array.from({ length: 25 }, (_, index) =>
      ghcrVersion(
        index + 1,
        index.toString(16).padStart(40, '0'),
        new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      ),
    )
    const plan = planGhcrRetention(
      { 'tungchiahui_web-postgres': old },
      new Date('2026-11-13T00:00:00.000Z'),
    )
    expect(plan.delete).toEqual([])
    expect(plan.policy.postgresMaintenanceOnly).toBe(true)
  })

  it('reads retained OCI indexes before allowing component cleanup', async () => {
    const digest = `sha256:${'b'.repeat(64)}`
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: 'synthetic-registry-token' }))
      .mockResolvedValueOnce(
        Response.json({
          manifests: [{ digest, platform: { os: 'linux', architecture: 'amd64' } }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ config: { digest } }))
      .mockResolvedValueOnce(
        Response.json({ config: { Labels: { 'cn.tungchiahui.release.recovery-digest': digest } } }),
      )
    vi.stubGlobal('fetch', fetcher)
    try {
      expect(
        await retainedComponentReferences('synthetic-github-token', 'fixture', [
          ghcrVersion(1, 'a'.repeat(40), '2026-01-01T00:00:00.000Z'),
        ]),
      ).toEqual([`tungchiahui_web-recovery@${digest}`])
      fetcher.mockResolvedValueOnce(new Response('', { status: 503 }))
      await expect(
        retainedComponentReferences('synthetic-github-token', 'fixture', []),
      ).rejects.toThrow('authenticate')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
