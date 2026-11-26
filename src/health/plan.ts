import type { BodyTargetPoint, HealthPlan } from './contracts'
import type { DisplayMetricKey } from './display-metrics'

export function healthPlanPhases(plan: HealthPlan) {
  const dayBefore = (day: string) => new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)
  const dayAfter = (day: string) => new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10)
  const holdWeight =
    plan.targets.find((point) => point.date === plan.holdStart)?.targetMin ?? plan.startWeight
  return [
    {
      key: 'phaseInitial',
      from: plan.startDate,
      to: dayBefore(plan.holdStart),
      target: holdWeight,
    },
    { key: 'phaseHold', from: plan.holdStart, to: plan.holdEnd, target: holdWeight },
    {
      key: 'phaseLoss',
      from: dayAfter(plan.holdEnd),
      to: plan.checkpoint?.date ?? plan.endDate,
      target: plan.checkpoint?.weight ?? plan.goalWeight,
    },
    ...(plan.checkpoint
      ? [
          {
            key: 'phaseChallenge' as const,
            from: dayAfter(plan.checkpoint.date),
            to: plan.endDate,
            target: plan.goalWeight,
          },
        ]
      : []),
    {
      key: plan.maintainAfterGoal ? 'phaseMaintenance' : 'phaseLongTerm',
      from: dayAfter(plan.endDate),
      to: '',
      target: plan.longTermWeight,
    },
  ] as const
}

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

export function metricTargetAt(plan: HealthPlan, metric: DisplayMetricKey, day: string) {
  const points = plan.bodyTargets?.points
  const first = points?.[0]
  const last = points?.at(-1)
  const inBodyPlan = first && last && day >= first.date && day <= last.date
  const index = inBodyPlan ? points.findIndex((point) => point.date >= day) : -1
  const next = points?.[index]
  const interpolated = next !== undefined && next.date !== day
  if (metric === 'weight') {
    const target = targetAt(plan, day)
    return target && { ...target, interpolated }
  }
  if (!next || !isBodyTargetMetric(metric)) return null
  const previous = points?.[index - 1]
  const value =
    interpolated && previous
      ? previous[metric] +
        (next[metric] - previous[metric]) *
          ((Date.parse(day) - Date.parse(previous.date)) /
            (Date.parse(next.date) - Date.parse(previous.date)))
      : next[metric]
  return { min: value, max: value, interpolated }
}

export function isBodyTargetMetric(
  metric: DisplayMetricKey,
): metric is (typeof bodyTargetMetrics)[number] {
  return bodyTargetMetrics.some((target) => target === metric)
}

export const bodyTargetMetrics = [
  'weight',
  'bodyFat',
  'fatMass',
  'leanMass',
  'muscleMass',
  'skeletalMuscleMass',
  'proteinMass',
  'waterMass',
  'bodyWater',
  'bmi',
  'basalMetabolism',
] as const satisfies readonly (keyof Omit<BodyTargetPoint, 'date'>)[]
