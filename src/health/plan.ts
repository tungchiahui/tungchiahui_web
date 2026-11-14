import type { HealthPlan } from './contracts'

export function targetAt(plan: HealthPlan, day: string) {
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
