// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: spawn,
}))

import { runHostCommand } from '../../src/host-release/provision'

beforeEach(() => {
  spawn.mockReset()
  spawn.mockReturnValue({ status: 0, stdout: '', stderr: '' })
})

describe('Host command deadlines', () => {
  it('bounds ordinary Host commands at twenty minutes', () => {
    runHostCommand('docker', ['inspect', 'postgres'])
    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/docker',
      ['inspect', 'postgres'],
      expect.objectContaining({ timeout: 1_200_000 }),
    )
  })

  it('passes the explicit bounded recovery deadline to the child process', () => {
    runHostCommand('docker', ['compose', 'run', 'deploy-agent'], {}, false, {
      timeoutMilliseconds: 90 * 60 * 1000,
    })
    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/docker',
      ['compose', 'run', 'deploy-agent'],
      expect.objectContaining({ timeout: 5_400_000 }),
    )
  })
})
