import { type Measurement, type MetricKey, measurementDay } from './contracts'
export function trendPoints(
  records: readonly Measurement[],
  metric: MetricKey,
  daily: boolean,
  from: string,
  to: string,
) {
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
