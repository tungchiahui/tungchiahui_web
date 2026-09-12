import type { WeightRecord } from './contracts'

export type WeightMilestone = { stage: number; date: string; min: number; max: number }

export const START_WEIGHT = 98
export const GOAL_WEIGHT = 75
export const PLAN_START_DATE = '2026-06-11'
export const PLAN_END_DATE = '2027-02-04'

export const weightMilestones = [
  { stage: 0, date: '2026-06-11', min: 98, max: 98 },
  { stage: 1, date: '2026-06-25', min: 96, max: 96.5 },
  { stage: 2, date: '2026-07-09', min: 94, max: 95 },
  { stage: 3, date: '2026-07-23', min: 92.5, max: 93.5 },
  { stage: 4, date: '2026-08-06', min: 91, max: 92 },
  { stage: 5, date: '2026-08-20', min: 89.5, max: 90.5 },
  { stage: 6, date: '2026-09-03', min: 88, max: 89.5 },
  { stage: 7, date: '2026-09-17', min: 86.5, max: 88 },
  { stage: 8, date: '2026-10-01', min: 85, max: 86.5 },
  { stage: 9, date: '2026-10-15', min: 83.5, max: 85 },
  { stage: 10, date: '2026-10-29', min: 82, max: 83.5 },
  { stage: 11, date: '2026-11-12', min: 80.5, max: 82 },
  { stage: 12, date: '2026-11-26', min: 79, max: 80.5 },
  { stage: 13, date: '2026-12-10', min: 78, max: 79.5 },
  { stage: 14, date: '2026-12-24', min: 77, max: 78.5 },
  { stage: 15, date: '2027-01-07', min: 76, max: 77.5 },
  { stage: 16, date: '2027-01-21', min: 75, max: 76.5 },
  { stage: 17, date: '2027-02-04', min: 74.5, max: 75.5 },
] as const satisfies readonly WeightMilestone[]

export function createWeeklyRecords(): WeightRecord[] {
  const records: WeightRecord[] = []
  const start = parseIsoDate(PLAN_START_DATE)
  const end = parseIsoDate(PLAN_END_DATE)

  for (let cursor = start; cursor <= end; cursor += 7 * 24 * 60 * 60 * 1000) {
    const date = toIsoDate(cursor)
    const target = getTargetRange(date)

    records.push({
      date,
      targetMin: target.min,
      targetMax: target.max,
      weight: '',
      bodyFat: '',
      muscleMass: '',
      waist: '',
      note: '',
    })
  }

  return records
}

export function getTargetRange(date: string) {
  const timestamp = parseIsoDate(date)
  const first = weightMilestones[0]
  const last = weightMilestones[weightMilestones.length - 1]

  if (!first || !last) throw new Error('Missing weight plan milestones')
  if (timestamp <= parseIsoDate(first.date)) return { min: first.min, max: first.max }
  if (timestamp >= parseIsoDate(last.date)) return { min: last.min, max: last.max }

  const nextIndex = weightMilestones.findIndex((item) => parseIsoDate(item.date) >= timestamp)
  const previous = weightMilestones[nextIndex - 1]
  const next = weightMilestones[nextIndex]
  if (!previous || !next) throw new Error('Missing weight interval')
  const previousTime = parseIsoDate(previous.date)
  const nextTime = parseIsoDate(next.date)
  const progress = (timestamp - previousTime) / (nextTime - previousTime)

  return {
    min: roundToTenth(previous.min + (next.min - previous.min) * progress),
    max: roundToTenth(previous.max + (next.max - previous.max) * progress),
  }
}

export function parseIsoDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function toIsoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10
}
