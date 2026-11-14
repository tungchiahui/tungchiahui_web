import { type Measurement, type MetricKey, measurementDay, metricDefinitions } from './contracts'

export type TrendPoint = {
  id: string
  time: string
  value: number
  count: number
  timePrecision?: Measurement['timePrecision']
  observedValue?: number
}
export function trendPoints(
  records: readonly Measurement[],
  metric: MetricKey,
  daily: boolean,
  from: string,
  to: string,
): TrendPoint[] {
  const values = records
    .filter(
      (row) =>
        !row.excluded &&
        row[metric] !== null &&
        (!from || measurementDay(row.measuredAt) >= from) &&
        (!to || measurementDay(row.measuredAt) <= to),
    )
    .toSorted((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  if (!daily)
    return values.map((row) => ({
      id: row.id,
      time: row.measuredAt,
      value: Number(row[metric]),
      count: 1,
      timePrecision: row.timePrecision,
    }))
  const groups = new Map<string, { total: number; count: number }>()
  for (const row of values) {
    const day = measurementDay(row.measuredAt)
    const old = groups.get(day) ?? { total: 0, count: 0 }
    groups.set(day, { total: old.total + Number(row[metric]), count: old.count + 1 })
  }
  return [...groups].map(([day, row]) => ({
    id: day,
    time: `${day}T00:00:00+08:00`,
    value: row.total / row.count,
    count: row.count,
  }))
}

export type TrendMode = 'raw' | 'daily' | 'rolling' | 'smooth'
export const smoothingWindows = [7, 14, 30] as const
export type SmoothingWindow = (typeof smoothingWindows)[number]
const dayMilliseconds = 86400000

export function metricSeries(
  records: readonly Measurement[],
  metric: MetricKey,
  mode: TrendMode,
  from = '',
  to = '',
  smoothing: SmoothingWindow = 14,
): TrendPoint[] {
  if (mode === 'smooth')
    return smoothDailyPoints(trendPoints(records, metric, true, '', to), smoothing).filter(
      (point) => {
        const day = measurementDay(point.time)
        return (!from || day >= from) && (!to || day <= to)
      },
    )
  if (mode !== 'rolling') return trendPoints(records, metric, mode === 'daily', from, to)
  const daily = trendPoints(records, metric, true, '', to)
  let start = 0
  let total = 0
  return daily
    .map((point, index) => {
      total += point.value
      while (
        start < index &&
        Date.parse(daily[start]?.time ?? '') < Date.parse(point.time) - 6 * dayMilliseconds
      ) {
        total -= daily[start]?.value ?? 0
        start++
      }
      return { ...point, value: total / (index - start + 1), count: index - start + 1 }
    })
    .filter((point) => !from || measurementDay(point.time) >= from)
}

// Local linear regression uses calendar distance and tri-cube weights. Each
// valid day contributes once. Missing days never become regression samples.
export function smoothDailyPoints(
  points: readonly TrendPoint[],
  window: SmoothingWindow,
): TrendPoint[] {
  const times = points.map((point) => Date.parse(point.time) / dayMilliseconds)
  const radius = window / 2
  let left = 0,
    right = 0
  return points.map((point, index) => {
    const center = times[index] ?? 0
    while (left < index && (times[left] ?? center) < center - radius) left++
    while (right < points.length && (times[right] ?? center) <= center + radius) right++
    let weight = 0,
      weightedX = 0,
      weightedY = 0,
      weightedXX = 0,
      weightedXY = 0
    let min = point.value,
      max = point.value
    for (let neighbor = left; neighbor < right; neighbor++) {
      const sample = points[neighbor]
      if (!sample) continue
      const x = (times[neighbor] ?? center) - center
      const w = Math.max(0, 1 - Math.abs(x / radius) ** 3) ** 3
      weight += w
      weightedX += w * x
      weightedY += w * sample.value
      weightedXX += w * x * x
      weightedXY += w * x * sample.value
      if (w > 0) {
        min = Math.min(min, sample.value)
        max = Math.max(max, sample.value)
      }
    }
    const denominator = weight * weightedXX - weightedX ** 2
    const slope =
      denominator > 1e-10 ? (weight * weightedXY - weightedX * weightedY) / denominator : 0
    const fitted = weight ? (weightedY - slope * weightedX) / weight : point.value
    return { ...point, observedValue: point.value, value: Math.max(min, Math.min(max, fitted)) }
  })
}

export function periodStart(day: string, period: 'week' | 'month') {
  const date = new Date(`${day}T00:00:00Z`)
  if (period === 'month') date.setUTCDate(1)
  else date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export function periodEnd(start: string, period: 'week' | 'month') {
  const date = new Date(`${start}T00:00:00Z`)
  if (period === 'month') date.setUTCMonth(date.getUTCMonth() + 1)
  else date.setUTCDate(date.getUTCDate() + 7)
  return new Date(date.getTime() - dayMilliseconds).toISOString().slice(0, 10)
}

export function periodSummaries(records: readonly Measurement[], period: 'week' | 'month') {
  const days = new Map<string, { weight: number; weights: number; bodyFat: number; fats: number }>()
  for (const row of records) {
    if (row.excluded || !metricDefinitions.some(({ key }) => row[key] !== null)) continue
    const day = measurementDay(row.measuredAt)
    const bucket = days.get(day) ?? { weight: 0, weights: 0, bodyFat: 0, fats: 0 }
    if (row.weight !== null) {
      bucket.weight += row.weight
      bucket.weights++
    }
    if (row.bodyFat !== null) {
      bucket.bodyFat += row.bodyFat
      bucket.fats++
    }
    days.set(day, bucket)
  }
  const periods = new Map<
    string,
    { days: number; weight: number; weights: number; bodyFat: number; fats: number }
  >()
  for (const [day, values] of days) {
    const start = periodStart(day, period)
    const bucket = periods.get(start) ?? { days: 0, weight: 0, weights: 0, bodyFat: 0, fats: 0 }
    bucket.days++
    if (values.weights) {
      bucket.weight += values.weight / values.weights
      bucket.weights++
    }
    if (values.fats) {
      bucket.bodyFat += values.bodyFat / values.fats
      bucket.fats++
    }
    periods.set(start, bucket)
  }
  const summaries = [...periods]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([start, values]) => ({
      start,
      end: periodEnd(start, period),
      days: values.days,
      weight: values.weights ? values.weight / values.weights : null,
      bodyFat: values.fats ? values.bodyFat / values.fats : null,
    }))
  return summaries.map((summary, index) => {
    const previous = summaries[index - 1]
    const adjacent =
      previous &&
      new Date(Date.parse(previous.end) + dayMilliseconds).toISOString().slice(0, 10) ===
        summary.start
    return {
      ...summary,
      change:
        adjacent && previous.weight !== null && summary.weight !== null
          ? summary.weight - previous.weight
          : null,
    }
  })
}

export function measurementCalendar(records: readonly Measurement[], end: string) {
  const last = Date.parse(end)
  const monday = Date.parse(periodStart(end, 'week'))
  const start = monday - 12 * 7 * dayMilliseconds
  const counts = new Map<string, number>()
  for (const row of records) {
    if (row.excluded || !metricDefinitions.some(({ key }) => row[key] !== null)) continue
    const day = measurementDay(row.measuredAt)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return Array.from({ length: 91 }, (_, index) => {
    const timestamp = start + index * dayMilliseconds
    const day = new Date(timestamp).toISOString().slice(0, 10)
    return { day, count: counts.get(day) ?? 0, future: timestamp > last }
  })
}
