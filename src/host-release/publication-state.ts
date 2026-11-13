import { z } from 'zod'
import {
  findCompletedDeployment,
  findDeploymentOperation,
  readDeploymentState,
} from '../control-plane/control-state'
import { hostReleaseSchema } from './contracts'
import { publicReleaseReceiptSchema } from './publication-contracts'
import {
  type HostOperationLease,
  openHostReleaseDatabase,
  readHostExecutorStatus,
  readHostRuntime,
  requireHostOperationLease,
} from './state'

const pullStateSchema = z.object({
  enabled: z.union([z.literal(0), z.literal(1)]),
  next_check_at: z.string(),
  status_json: z.string(),
})
export function initializeReleasePull(path: string) {
  const db = openHostReleaseDatabase(path)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS host_release_pull_state(singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),next_check_at TEXT NOT NULL,status_json TEXT NOT NULL);
    INSERT OR IGNORE INTO host_release_pull_state VALUES(1,0,'1970-01-01T00:00:00.000Z','{}');`)
  } finally {
    db.close()
  }
}
export function readReleasePull(path: string) {
  initializeReleasePull(path)
  const db = openHostReleaseDatabase(path)
  try {
    const row = pullStateSchema.parse(
      db
        .prepare(
          'SELECT enabled,next_check_at,status_json FROM host_release_pull_state WHERE singleton_id=1',
        )
        .get(),
    )
    return {
      enabled: row.enabled === 1,
      nextCheckAt: row.next_check_at,
      status: z.record(z.string(), z.unknown()).parse(JSON.parse(row.status_json) as unknown),
    }
  } finally {
    db.close()
  }
}
export function writeReleasePull(
  path: string,
  status: Readonly<Record<string, unknown>>,
  now = new Date(),
) {
  const db = openHostReleaseDatabase(path)
  try {
    db.prepare(
      'UPDATE host_release_pull_state SET next_check_at=?,status_json=? WHERE singleton_id=1',
    ).run(new Date(now.getTime() + 60000).toISOString(), JSON.stringify(status))
  } finally {
    db.close()
  }
}
export function setReleasePullEnabled(
  path: string,
  enabled: boolean,
  now = new Date(),
  identity?: HostOperationLease,
) {
  initializeReleasePull(path)
  const db = openHostReleaseDatabase(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    requireHostOperationLease(db, identity)
    db.prepare(
      'UPDATE host_release_pull_state SET enabled=?,next_check_at=? WHERE singleton_id=1',
    ).run(enabled ? 1 : 0, now.toISOString())
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function publicReleaseStatus(path: string, sha?: string, digest?: string) {
  const deployment = readDeploymentState(path)
  const db = openHostReleaseDatabase(path)
  const installed = db
    .prepare("SELECT name FROM sqlite_master WHERE name='host_release_runtime'")
    .get()
  db.close()
  if (!installed) return { current: null, state: 'pending' }
  const host = readHostRuntime(path)
  let current: z.infer<typeof publicReleaseReceiptSchema> | null = null
  if (
    deployment.currentSha &&
    deployment.currentDigest &&
    deployment.pendingSlot === 'none' &&
    readHostExecutorStatus(path).healthy &&
    host.current_sha === deployment.currentSha &&
    host.pending_sha === null
  ) {
    const completed = findCompletedDeployment(path, deployment.currentSha, deployment.currentDigest)
    const release = hostReleaseSchema
      .extend({ status: z.literal('converged'), executorSha: z.string().optional() })
      .safeParse(completed?.result?.hostRelease)
    if (
      release.success &&
      completed?.result?.hostRelease &&
      (completed.result.hostRelease as Record<string, unknown>).status === 'converged' &&
      release.data.sha === deployment.currentSha &&
      release.data.webDigest === deployment.currentDigest
    ) {
      current = publicReleaseReceiptSchema.parse({
        gitSha: release.data.sha,
        imageDigest: release.data.webDigest,
        serviceSha: release.data.serviceSha ?? release.data.sha,
        recoverySha: release.data.recoverySha ?? release.data.sha,
        manifestVersion: 2,
      })
    }
  }
  if (!sha || !digest) return { current, state: current ? 'completed' : 'pending' }
  if (current?.gitSha === sha && current.imageDigest === digest)
    return { current, state: 'completed' }
  const latest = findDeploymentOperation(path, sha, digest, false)
  return {
    current,
    state:
      latest?.status === 'failed'
        ? 'failed'
        : latest?.status === 'cancelled'
          ? 'cancelled'
          : 'pending',
  }
}
