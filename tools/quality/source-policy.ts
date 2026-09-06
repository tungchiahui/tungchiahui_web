import { analyzeRepository } from './source-policy-lib'

const violations = analyzeRepository(process.cwd())

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}: [${violation.rule}] ${violation.message}`)
  }
  process.exitCode = 1
} else {
  console.log('Source policy: PASS')
}
