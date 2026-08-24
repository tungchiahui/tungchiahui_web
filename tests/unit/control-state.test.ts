import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { initializeControlState, readControlState } from '../../src/control-plane/control-state'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('local control-state SQLite', () => {
  it('uses a persistent versioned WAL/FULL baseline', () => {
    const directory = mkdtempSync(join(tmpdir(), 'control-state-unit-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'control.db')
    const initialized = initializeControlState(path, 'test')
    const reopened = readControlState(path)

    expect(typeof initialized.initializedAt).toBe('string')
    expect(initialized).toEqual({
      environment: 'test',
      initializedAt: initialized.initializedAt,
      journalMode: 'wal',
      schemaVersion: 1,
      synchronous: 2,
    })
    expect(reopened).toEqual(initialized)
    expect(initializeControlState(path, 'test')).toEqual(initialized)
  })

  it('refuses to reuse state from another environment', () => {
    const directory = mkdtempSync(join(tmpdir(), 'control-state-unit-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'control.db')
    initializeControlState(path, 'local')

    expect(() => initializeControlState(path, 'test')).toThrow(
      'Control-state environment does not match',
    )
  })
})
