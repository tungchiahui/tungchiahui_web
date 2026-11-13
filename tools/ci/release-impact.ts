import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

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
    /^messages\/(?:zh-CN|zh-HK|zh-TW|en-US)\.json$/u.test(path) ||
    /^src\/components\/ui\/[a-z0-9-]+\.tsx$/u.test(path) ||
    (path.startsWith('src/components/') &&
      publicComponents.has(path.slice('src/components/'.length)))
  return paths.every(isPublicInterface) ? 'ui' : 'full'
}

function main() {
  const target = process.env.RELEASE_SHA ?? ''
  const base = process.env.BASE_SHA ?? ''
  let mode: QualityMode = 'full'
  if (
    process.env.EVENT_NAME === 'push' &&
    /^[a-f0-9]{40}$/u.test(target) &&
    /^[a-f0-9]{40}$/u.test(base) &&
    base !== '0'.repeat(40)
  ) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', base, target], { stdio: 'ignore' })
      const paths = execFileSync(
        'git',
        ['diff', '--no-renames', '--name-only', '-z', base, target],
        {
          encoding: 'utf8',
        },
      )
        .split('\0')
        .filter(Boolean)
      mode = classifyReleaseImpact(paths)
    } catch {
      // Missing history or an unrecognized transition always takes the complete gate.
    }
  }
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error('GitHub Actions output file is required')
  appendFileSync(output, `quality_mode=${mode}\n`)
  console.log(JSON.stringify({ event: 'release_quality_plan', mode }))
}

if (process.argv[1]?.endsWith('/release-impact.ts')) main()
