// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { componentRevision, componentSourcePaths } from '../../tools/ci/component-images'
import { supportsComponentReuse } from '../../tools/ci/plan-components'
import { qualityGatePassed } from '../../tools/ci/quality-gate'
import { classifyReleaseImpact } from '../../tools/ci/release-impact'
import { releaseResultPassed } from '../../tools/ci/release-result'

describe('graded release checks', () => {
  it('classifies a backend-to-document rename as a full change through the native CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-diff-'))
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim()
    try {
      git('init', '--quiet')
      writeFileSync(join(root, 'backend.ts'), 'export const value = 1\n')
      git('add', '.')
      git('commit', '-qm', 'Backend fixture')
      const base = git('rev-parse', 'HEAD')
      mkdirSync(join(root, 'docs'))
      git('mv', 'backend.ts', 'docs/route.md')
      git('commit', '-qm', 'Rename fixture')
      const target = git('rev-parse', 'HEAD')
      const output = join(root, 'outputs')
      execFileSync(process.execPath, [resolve('tools/ci/release-impact.ts')], {
        cwd: root,
        env: {
          ...process.env,
          EVENT_NAME: 'push',
          RELEASE_SHA: target,
          BASE_SHA: base,
          GITHUB_OUTPUT: output,
        },
        stdio: 'ignore',
      })
      expect(readFileSync(output, 'utf8')).toBe('quality_mode=full\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('only takes the short paths for an explicit public-interface or documentation diff', () => {
    expect(classifyReleaseImpact(['docs/operations/server-release.md', 'README.md'])).toBe('docs')
    expect(
      classifyReleaseImpact(['src/components/article-reader.tsx', 'messages/zh-CN.json']),
    ).toBe('ui')
    expect(classifyReleaseImpact(['src/app/globals.css', 'docs/example.md'])).toBe('ui')
    for (const path of [
      'AGENTS.md',
      'pnpm-lock.yaml',
      'src/components/account-button.tsx',
      'src/components/personal/weight-tracker.tsx',
      'src/web/public-page.tsx',
      'src/app/api/personal-data/[dataset]/route.ts',
      'drizzle/0014_private_body_measurements.sql',
      'src/control-plane/account-http.ts',
      'src/components/new-feature.tsx',
      '.github/workflows/release.yml',
    ]) {
      expect(classifyReleaseImpact([path])).toBe('full')
    }
    expect(classifyReleaseImpact([])).toBe('full')
    expect(classifyReleaseImpact(['messages/en-US.json', 'src/health/repository.ts'])).toBe('full')
  })

  it('requires every planned check and rejects failures even in optional checks', () => {
    const all = {
      static: 'success',
      unit: 'success',
      integration: 'success',
      migration: 'success',
      infrastructure: 'success',
    }
    expect(qualityGatePassed('full', all)).toBe(true)
    expect(
      qualityGatePassed('ui', { ...all, migration: 'skipped', infrastructure: 'skipped' }),
    ).toBe(true)
    expect(
      qualityGatePassed('docs', {
        static: 'success',
        unit: 'skipped',
        integration: 'skipped',
        migration: 'skipped',
        infrastructure: 'skipped',
      }),
    ).toBe(true)
    for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
      expect(qualityGatePassed('full', { ...all, infrastructure: status })).toBe(false)
      expect(qualityGatePassed('ui', { ...all, integration: status })).toBe(false)
    }
    expect(qualityGatePassed('ui', { ...all, infrastructure: 'failure' })).toBe(false)
    expect(qualityGatePassed('unexpected', all)).toBe(false)
  })

  it('distinguishes a verified documentation update from a completed application deployment', () => {
    const result = {
      mode: 'full',
      quality: 'success',
      build: 'success',
      deploy: 'success',
      deploymentEnabled: 'true',
    }
    expect(releaseResultPassed(result)).toBe(true)
    expect(
      releaseResultPassed({
        ...result,
        mode: 'docs',
        build: 'skipped',
        deploy: 'skipped',
        deploymentEnabled: 'false',
      }),
    ).toBe(true)
    expect(releaseResultPassed({ ...result, deploy: 'skipped' })).toBe(false)
    expect(
      releaseResultPassed({
        ...result,
        quality: 'failure',
        mode: 'docs',
        build: 'skipped',
        deploy: 'skipped',
      }),
    ).toBe(false)
    expect(releaseResultPassed({ ...result, mode: 'unexpected' })).toBe(false)
  })
})

describe('immutable component reuse', () => {
  it('reuses the installed revision across frontend and documentation commits, and invalidates changed runtime inputs', () => {
    const root = mkdtempSync(join(tmpdir(), 'component-revision-'))
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim()
    const commit = () => {
      git('add', '.')
      git('commit', '-qm', 'Synthetic component inputs')
      return git('rev-parse', 'HEAD')
    }
    try {
      git('init', '--quiet')
      writeFileSync(join(root, 'runtime.ts'), 'export const value = 1\n')
      const initial = commit()
      writeFileSync(join(root, 'README.md'), 'Component activation\n')
      const installed = commit()
      writeFileSync(join(root, 'frontend.tsx'), 'export const title = "Changed"\n')
      const target = commit()
      expect(componentRevision(root, target, ['runtime.ts'])).toBe(initial)
      expect(componentRevision(root, target, ['runtime.ts'], installed)).toBe(installed)
      writeFileSync(join(root, 'runtime.ts'), 'export const value = 2\n')
      const changed = commit()
      expect(componentRevision(root, changed, ['runtime.ts'], installed)).toBe(changed)
      expect(() => componentRevision(root, changed, ['runtime.ts'], 'invalid')).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('requires a healthy compatible executor with no pending generation while allowing ordinary backup work', () => {
    const status = {
      controlState: { incompleteOperations: 0 },
      hostExecutor: {
        installed: true,
        healthy: true,
        currentSha: 'a'.repeat(40),
        pendingSha: null,
      },
    }
    const source = 'cn.tungchiahui.host-release-manifest-versions="1,2"'
    expect(supportsComponentReuse(status, source)).toBe(true)
    expect(supportsComponentReuse(status, '')).toBe(false)
    expect(
      supportsComponentReuse({ ...status, controlState: { incompleteOperations: 1 } }, source),
    ).toBe(true)
    expect(
      supportsComponentReuse(
        { ...status, hostExecutor: { ...status.hostExecutor, healthy: false } },
        source,
      ),
    ).toBe(false)
    expect(() => supportsComponentReuse({ hostExecutor: {} }, source)).toThrow()
  })

  it('includes transitive service dependencies, migrations and build recipes', async () => {
    const paths = await componentSourcePaths(resolve('.'), 'service')
    expect(paths).toEqual(
      expect.arrayContaining([
        'src/health/repository.ts',
        'src/control-plane/http-server.ts',
        'pnpm-lock.yaml',
        'drizzle',
        'ops/database',
      ]),
    )
    expect(paths.some((path) => path.startsWith('src/components/'))).toBe(false)
    expect(await componentSourcePaths(resolve('.'), 'recovery')).toEqual(
      expect.arrayContaining([
        'src/host-release/coordinator.ts',
        'src/deployment/docker-platform.ts',
        'ops/production',
      ]),
    )
    expect(await componentSourcePaths(resolve('.'), 'postgres')).toEqual([
      'ops/production/images/postgres.Dockerfile',
      '.github/workflows/release.yml',
    ])
  })
})
