import { appendFileSync } from 'node:fs'

export function releaseResultPassed(
  input: Readonly<{
    mode: string | undefined
    quality: string | undefined
    build: string | undefined
    deploy: string | undefined
    deploymentEnabled: string | undefined
  }>,
) {
  if (input.quality !== 'success') return false
  if (input.mode === 'docs') return input.build === 'skipped' && input.deploy === 'skipped'
  return (
    (input.mode === 'ui' || input.mode === 'full') &&
    input.build === 'success' &&
    input.deploy === 'success' &&
    input.deploymentEnabled === 'true'
  )
}

if (process.argv[1]?.endsWith('/release-result.ts')) {
  const passed = releaseResultPassed({
    mode: process.env.QUALITY_MODE,
    quality: process.env.QUALITY_RESULT,
    build: process.env.BUILD_RESULT,
    deploy: process.env.DEPLOY_RESULT,
    deploymentEnabled: process.env.DEPLOYMENT_ENABLED,
  })
  if (!passed) throw new Error('Required release outcome was not achieved')
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary)
    appendFileSync(
      summary,
      process.env.QUALITY_MODE === 'docs'
        ? '### Documentation validation completed\n'
        : '### Production release verified\n',
    )
}
