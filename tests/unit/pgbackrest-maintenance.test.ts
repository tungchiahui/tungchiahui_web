// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const command = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawnSync: command }))

import { runPgBackRestBackup } from '../../src/recovery/pgbackrest'

const configuration = { configPath: '/etc/pgbackrest/pgbackrest.conf', stanza: 'tungchiahui' }
const before = Date.parse('2026-11-13T08:00:00Z') / 1000
const after = Date.parse('2026-11-13T09:00:00Z') / 1000
function backup(label: string, start: number) {
  return {
    label,
    type: 'full',
    timestamp: { start, stop: start + 5 },
    info: { size: 1024, repository: { size: 512, delta: 512 } },
  }
}
beforeEach(() => {
  command.mockReset()
})
function arrange(records: ReturnType<typeof backup>[]) {
  command.mockImplementation((_executable: string, args: readonly string[]) => {
    if (args.includes('backup')) records.push(backup('new-completed-full', after + 1))
    return {
      status: 0,
      stdout: JSON.stringify([
        {
          name: 'tungchiahui',
          status: { code: 0, message: 'ok' },
          backup: records,
          archive: [{ max: '000000010000000000000001' }],
        },
      ]),
      stderr: '',
    }
  })
}
describe('maintenance backup replay', () => {
  it('reuses a full label completed after the durable candidate backup intent', () => {
    arrange([backup('before-switch', before), backup('after-switch', after + 1)])
    expect(
      runPgBackRestBackup(configuration, 'full', undefined, '2026-11-13T09:00:00.123Z').backupId,
    ).toBe('after-switch')
    expect(
      command.mock.calls.some((call) => (call[1] as readonly string[]).includes('backup')),
    ).toBe(false)
  })
  it('creates a new full backup when only the pre-switch label exists', () => {
    arrange([backup('before-switch', before)])
    expect(
      runPgBackRestBackup(configuration, 'full', undefined, '2026-11-13T09:00:00.123Z').backupId,
    ).toBe('new-completed-full')
    expect(
      command.mock.calls.filter((call) => (call[1] as readonly string[]).includes('backup')),
    ).toHaveLength(1)
  })
})
