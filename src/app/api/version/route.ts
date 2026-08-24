import { z } from 'zod'

export const dynamic = 'force-dynamic'

const deploymentShaSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .default('0'.repeat(40))

export function GET() {
  const gitSha = deploymentShaSchema.parse(process.env.SITE_DEPLOYMENT_SHA)
  return Response.json(
    {
      deployment: gitSha === '0'.repeat(40) ? 'development-stub' : 'immutable-git-sha',
      gitSha,
      service: 'web',
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
