import { z } from 'zod'

export const dynamic = 'force-dynamic'

const deploymentShaSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .default('0'.repeat(40))
const deploymentSlotSchema = z.enum(['blue', 'green']).optional()

export function GET() {
  const gitSha = deploymentShaSchema.parse(process.env.SITE_DEPLOYMENT_SHA)
  const slot = deploymentSlotSchema.parse(process.env.SITE_SLOT)
  return Response.json(
    {
      deployment: gitSha === '0'.repeat(40) ? 'development-stub' : 'immutable-git-sha',
      gitSha,
      service: 'web',
      ...(slot === undefined ? {} : { slot }),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
