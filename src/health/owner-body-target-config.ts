import { z } from 'zod'
import { type BodyTargetPlan, bodyTargetPlanSchema } from './contracts'

export const ownerTargetSchedule = {
  checkpoint: { date: '2027-01-10', weight: 78.5 },
  holdEnd: '2026-10-25',
  goalDate: '2027-03-20',
} as const

function matchesOwnerBodyTargetSchedule({ points }: BodyTargetPlan) {
  const { checkpoint, holdEnd } = ownerTargetSchedule
  const last = points.at(-1)
  return (
    points.every((point) => point.date > holdEnd && point.date <= checkpoint.date) &&
    last?.date === checkpoint.date &&
    last.weight === checkpoint.weight
  )
}

const ownerBodyTargetsSchema = bodyTargetPlanSchema.refine(matchesOwnerBodyTargetSchedule)

export const healthBodyTargetsJsonSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .transform((value, context) => {
      try {
        return ownerBodyTargetsSchema.parse(JSON.parse(value) as unknown)
      } catch {
        context.addIssue({ code: 'custom', message: 'Invalid private body target plan' })
        return z.NEVER
      }
    })
    .optional(),
)
