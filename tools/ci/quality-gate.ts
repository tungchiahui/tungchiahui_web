import type { QualityMode } from './release-impact'

export function qualityGatePassed(
  mode: string,
  results: Readonly<Record<string, string | undefined>>,
) {
  if (mode !== 'docs' && mode !== 'ui' && mode !== 'full') return false
  const required: Record<QualityMode, readonly string[]> = {
    docs: ['static'],
    ui: ['static', 'unit', 'integration'],
    full: ['static', 'unit', 'integration', 'infrastructure', 'migration'],
  }
  return ['static', 'unit', 'integration', 'infrastructure', 'migration'].every((job) =>
    required[mode].includes(job)
      ? results[job] === 'success'
      : ['success', 'skipped'].includes(results[job] ?? ''),
  )
}

if (process.argv[1]?.endsWith('/quality-gate.ts')) {
  const passed = qualityGatePassed(process.env.QUALITY_MODE ?? '', {
    static: process.env.STATIC_RESULT,
    unit: process.env.UNIT_RESULT,
    integration: process.env.INTEGRATION_RESULT,
    infrastructure: process.env.INFRASTRUCTURE_RESULT,
    migration: process.env.MIGRATION_RESULT,
  })
  if (!passed) throw new Error('Required release quality checks did not pass')
  console.log('Required release quality checks passed')
}
