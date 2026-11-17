import type { HealthPlan } from './contracts'

export function nextPlanTarget(plan: HealthPlan, day: string) {
  if (plan.checkpoint && day <= plan.checkpoint.date) return plan.checkpoint
  return { date: plan.endDate, weight: plan.goalWeight }
}

export function targetAt(plan: HealthPlan, day: string) {
  if (day > plan.endDate && plan.maintainAfterGoal) {
    return { min: plan.goalWeight, max: plan.goalWeight }
  }
  if (day < plan.startDate || day > plan.endDate) return null
  const nextIndex = plan.targets.findIndex((point) => point.date >= day)
  const next = plan.targets[nextIndex]
  if (!next) return null
  const previous = plan.targets[nextIndex - 1] ?? next
  const duration = Date.parse(next.date) - Date.parse(previous.date)
  const progress = duration ? (Date.parse(day) - Date.parse(previous.date)) / duration : 0
  return {
    min: previous.targetMin + (next.targetMin - previous.targetMin) * progress,
    max: previous.targetMax + (next.targetMax - previous.targetMax) * progress,
  }
}
