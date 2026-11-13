import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { confirmedPublication } from './github-publications'

export type QualityMode = 'docs' | 'ui' | 'full'

const publicComponents = new Set([
  'article-reader.tsx',
  'blog-index.tsx',
  'career-shell.tsx',
  'cdn-font-awesome.tsx',
  'content-link.tsx',
  'global-music-player.tsx',
  'mobile-navigation.tsx',
  'more-directory.tsx',
  'music-page.tsx',
  'music-player-provider.tsx',
  'print-resume.tsx',
  'reader-navigation-panel.tsx',
  'reader-scroll.ts',
  'site-shell.tsx',
  'stats-dashboard.tsx',
  'theme-toggle.tsx',
  'traffic-metrics.tsx',
  'use-reader-navigation.ts',
])

export function classifyReleaseImpact(paths: readonly string[]): QualityMode {
  if (paths.length === 0) return 'full'
  const isDocumentation = (path: string) =>
    path.startsWith('docs/') || ['README.md', 'CONTRIBUTING.md'].includes(path)
  if (paths.every(isDocumentation)) return 'docs'
  const isPublicInterface = (path: string) =>
    isDocumentation(path) ||
    path === 'src/app/globals.css' ||
    [
      'tests/unit/blog-wiki-compatibility.test.tsx',
      'tests/unit/reader-navigation-lifecycle.test.tsx',
      'tests/unit/reader-scroll.test.ts',
    ].includes(path) ||
    /^messages\/(?:zh-CN|zh-HK|zh-TW|en-US)\.json$/u.test(path) ||
    /^src\/components\/ui\/[a-z0-9-]+\.tsx$/u.test(path) ||
    (path.startsWith('src/components/') &&
      publicComponents.has(path.slice('src/components/'.length)))
  return paths.every(isPublicInterface) ? 'ui' : 'full'
}

export async function deployedReleaseBase(
  repository: string,
  token: string,
  request: typeof fetch = fetch,
): Promise<string | undefined> {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository) || !token) return undefined
  return (await confirmedPublication(token, request, repository))?.gitSha
}

export function classifyReleaseDiff(root: string, base: string, target: string): QualityMode {
  execFileSync('git', ['merge-base', '--is-ancestor', base, target], { cwd: root, stdio: 'ignore' })
  const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, target], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
  return classifyReleaseImpact(paths)
}

async function main() {
  const target = process.env.RELEASE_SHA ?? ''
  let mode: QualityMode = 'full'
  if (process.env.EVENT_NAME === 'push' && /^[a-f0-9]{40}$/u.test(target)) {
    try {
      const base = await deployedReleaseBase(
        process.env.GITHUB_REPOSITORY ?? '',
        process.env.GITHUB_TOKEN ?? '',
      )
      if (base) mode = classifyReleaseDiff(process.cwd(), base, target)
    } catch {
      // An unverified baseline, missing history or API failure takes the complete gate.
    }
  }
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error('GitHub Actions output file is required')
  appendFileSync(output, `quality_mode=${mode}\n`)
  console.log(JSON.stringify({ event: 'release_quality_plan', mode }))
}

if (process.argv[1]?.endsWith('/release-impact.ts')) await main()
