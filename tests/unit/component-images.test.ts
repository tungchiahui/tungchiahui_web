// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const commands = vi.hoisted(() => ({ exec: vi.fn(), inspect: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: commands.exec, spawnSync: commands.inspect }))

import { resolveComponentImage } from '../../tools/ci/component-images'

const target = 'a'.repeat(40)
const source = 'b'.repeat(40)
const digest = `sha256:${'c'.repeat(64)}`

beforeEach(() => {
  vi.resetAllMocks()
})

describe('component registry identity', () => {
  it('keeps a legacy executor on same-SHA components and validates the existing digest', async () => {
    commands.exec.mockReturnValueOnce(target).mockReturnValueOnce('').mockReturnValueOnce(target)
    commands.inspect.mockReturnValue({ status: 0, stdout: `${digest}\n`, stderr: '' })
    expect(await resolveComponentImage('service', target, false)).toEqual({
      source_sha: target,
      image_reference: `ghcr.io/tungchiahui/tungchiahui_web-service:${target}`,
      image_digest: digest,
      exists: true,
    })
    expect(commands.exec.mock.calls[1]?.[1]).toEqual([
      'pull',
      `ghcr.io/tungchiahui/tungchiahui_web-service@${digest}`,
    ])
  })

  it('reuses the PostgreSQL recipe revision independently of the Web revision', async () => {
    commands.exec
      .mockReturnValueOnce(target)
      .mockReturnValueOnce(source)
      .mockReturnValueOnce('')
      .mockReturnValueOnce(source)
    commands.inspect.mockReturnValue({ status: 0, stdout: digest, stderr: '' })
    expect(await resolveComponentImage('postgres', target, false)).toMatchObject({
      source_sha: source,
      exists: true,
    })
  })

  it('builds only when the source tag is definitely absent', async () => {
    commands.exec.mockReturnValue(target)
    commands.inspect.mockReturnValue({ status: 1, stdout: '', stderr: 'manifest unknown' })
    expect(await resolveComponentImage('recovery', target, false)).toMatchObject({
      source_sha: target,
      image_digest: '',
      exists: false,
    })
    expect(commands.exec).toHaveBeenCalledTimes(1)
  })

  it('rejects an image whose OCI revision differs from its source tag', async () => {
    commands.exec.mockReturnValueOnce(target).mockReturnValueOnce('').mockReturnValueOnce(source)
    commands.inspect.mockReturnValue({ status: 0, stdout: digest, stderr: '' })
    await expect(resolveComponentImage('service', target, false)).rejects.toThrow(
      'different source revision',
    )
  })

  it('refuses ambiguous registry errors without exposing child diagnostics', async () => {
    commands.exec.mockReturnValue(target)
    commands.inspect.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'unauthorized synthetic-credential',
    })
    const error = await resolveComponentImage('service', target, false).catch(
      (caught: unknown) => caught,
    )
    expect(String(error)).toContain('Cannot safely determine')
    expect(String(error)).not.toContain('synthetic-credential')
  })
})
