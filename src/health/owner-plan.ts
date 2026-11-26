import type { Locale } from '../domain/persistence'
import { messagesForLocale } from '../i18n/messages'
import { getTargetRange } from '../personal/weight-plan'
import { type HealthReferenceProfile, type HealthSnapshot, healthPlanSchema } from './contracts'
import { ownerBodyTargets, ownerTargetSchedule } from './owner-body-targets'

export function ownerHealthPlan(
  locale: Locale,
  overrides: HealthSnapshot['planOverrides'],
  referenceProfile?: HealthReferenceProfile,
) {
  const { checkpoint, holdEnd, goalDate } = ownerTargetSchedule
  const targets = [
    { date: '2026-06-11', targetMin: 98, targetMax: 98 },
    { date: '2026-06-25', targetMin: 96, targetMax: 96.5 },
    { date: '2026-07-09', targetMin: 94, targetMax: 95 },
    { date: '2026-07-23', targetMin: 92.5, targetMax: 93.5 },
    { date: '2026-08-06', targetMin: 91, targetMax: 92 },
    { date: '2026-08-14', targetMin: 90, targetMax: 90 },
    { date: '2026-10-25', targetMin: 90, targetMax: 90 },
    { date: '2026-10-26', targetMin: 90, targetMax: 90 },
    ...ownerBodyTargets.points.map(({ date, weight }) => ({
      date,
      targetMin: weight,
      targetMax: weight,
    })),
    { date: goalDate, targetMin: 70, targetMax: 70 },
  ]
  // The approved replacement schedule governs August 14 onwards. Retain the
  // original overrides in the exchange file, and apply earlier custom targets.
  for (const point of overrides) {
    if (point.date < '2026-06-11' || point.date >= '2026-08-14') continue
    const legacy = getTargetRange(point.date)
    if (point.targetMin === legacy.min && point.targetMax === legacy.max) continue
    const existing = targets.findIndex((target) => target.date === point.date)
    if (existing < 0) targets.push(point)
    else targets[existing] = point
  }
  return {
    plan: healthPlanSchema.parse({
      startWeight: 98,
      goalWeight: 70,
      longTermWeight: 70,
      startDate: '2026-06-11',
      endDate: goalDate,
      checkpoint,
      bodyTargets: ownerBodyTargets,
      maintainAfterGoal: true,
      holdStart: '2026-08-14',
      holdEnd,
      targets: targets.toSorted((left, right) => left.date.localeCompare(right.date)),
    }),
    planMessages: messagesForLocale(locale).HealthPlan,
    ...(referenceProfile ? { referenceProfile } : {}),
  }
}
