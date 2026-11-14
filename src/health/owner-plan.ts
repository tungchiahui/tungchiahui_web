import type { Locale } from '../domain/persistence'
import { messagesForLocale } from '../i18n/messages'
import { getTargetRange } from '../personal/weight-plan'
import { type HealthSnapshot, healthPlanSchema } from './contracts'

export function ownerHealthPlan(locale: Locale, overrides: HealthSnapshot['planOverrides']) {
  const targets = [
    { date: '2026-06-11', targetMin: 98, targetMax: 98 },
    { date: '2026-06-25', targetMin: 96, targetMax: 96.5 },
    { date: '2026-07-09', targetMin: 94, targetMax: 95 },
    { date: '2026-07-23', targetMin: 92.5, targetMax: 93.5 },
    { date: '2026-08-06', targetMin: 91, targetMax: 92 },
    { date: '2026-08-14', targetMin: 90, targetMax: 90 },
    { date: '2026-10-25', targetMin: 90, targetMax: 90 },
    { date: '2026-10-26', targetMin: 90, targetMax: 90 },
    { date: '2027-01-10', targetMin: 80, targetMax: 80 },
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
      goalWeight: 80,
      longTermWeight: 75,
      startDate: '2026-06-11',
      endDate: '2027-01-10',
      holdStart: '2026-08-14',
      holdEnd: '2026-10-25',
      targets: targets.toSorted((left, right) => left.date.localeCompare(right.date)),
    }),
    planMessages: messagesForLocale(locale).HealthPlan,
  }
}
