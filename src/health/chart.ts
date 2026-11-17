import { measurementDay } from './contracts'
import type { TrendPoint } from './trends'

export type ChartPoint = { x: number; y: number }
export type CurveSegment = {
  start: ChartPoint
  end: ChartPoint
  control1: ChartPoint
  control2: ChartPoint
}

// Bounded cubic Hermite controls preserve the range between adjacent samples.
export function curveSegments(points: readonly ChartPoint[]): CurveSegment[] {
  const slopes = points.slice(1).map((point, index) => {
    const previous = points[index]
    return previous && point.x > previous.x ? (point.y - previous.y) / (point.x - previous.x) : 0
  })
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0] ?? 0
    if (index === points.length - 1) return slopes[index - 1] ?? 0
    const left = slopes[index - 1] ?? 0
    const right = slopes[index] ?? 0
    if (left * right <= 0) return 0
    return Math.sign(left) * Math.min(Math.abs(left), Math.abs(right))
  })
  return points.slice(1).flatMap((end, index) => {
    const start = points[index]
    if (!start) return []
    const third = Math.max(0, end.x - start.x) / 3
    return [
      {
        start,
        end,
        control1: { x: start.x + third, y: start.y + third * (tangents[index] ?? 0) },
        control2: { x: end.x - third, y: end.y - third * (tangents[index + 1] ?? 0) },
      },
    ]
  })
}

export function timeSeriesCurve(points: readonly TrendPoint[]) {
  return curveSegments(points.map((point) => ({ x: Date.parse(point.time), y: point.value })))
}

export function curveValue(segment: CurveSegment, ratio: number) {
  const t = Math.max(0, Math.min(1, ratio))
  const u = 1 - t
  return (
    u ** 3 * segment.start.y +
    3 * u ** 2 * t * segment.control1.y +
    3 * u * t ** 2 * segment.control2.y +
    t ** 3 * segment.end.y
  )
}

export function inspectCurve(
  points: readonly TrendPoint[],
  segments: readonly CurveSegment[],
  timestamp: number,
  raw = false,
  rawIndex?: number,
) {
  const first = points[0],
    last = points.at(-1)
  if (!first || !last) return null
  const time = raw
    ? timestamp
    : Date.parse(`${measurementDay(new Date(timestamp).toISOString())}T00:00:00+08:00`)
  const index = points.findIndex((point) => Date.parse(point.time) >= time)
  const nextIndex = index < 0 ? points.length - 1 : index
  const next = points[nextIndex] ?? last
  const previous = points[nextIndex - 1]
  const candidate =
    previous && Math.abs(Date.parse(previous.time) - time) < Math.abs(Date.parse(next.time) - time)
      ? previous
      : next
  const nearest = raw && rawIndex !== undefined ? (points[rawIndex] ?? candidate) : candidate
  const segment = segments[nextIndex - 1]
  if (
    !raw &&
    previous &&
    segment &&
    time > Date.parse(previous.time) &&
    time < Date.parse(next.time)
  ) {
    return {
      id: `estimate:${time}`,
      time: new Date(time).toISOString(),
      value: curveValue(segment, (time - segment.start.x) / (segment.end.x - segment.start.x)),
      observedValue: null,
      count: 0,
      estimated: true,
      timePrecision: 'date' as const,
      from: measurementDay(previous.time),
      to: measurementDay(next.time),
    }
  }
  return {
    ...nearest,
    observedValue: nearest.observedValue ?? nearest.value,
    estimated: false,
    from: '',
    to: '',
  }
}

export function chartYAxis(values: readonly number[], targetTicks = 5) {
  const finite = values.filter(Number.isFinite)
  const low = finite.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY)
  const high = finite.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY)
  if (!finite.length) return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] }
  const padding = Math.max((high - low) * 0.15, 0.5)
  const lower = Math.max(0, low - padding)
  const upper = high + padding
  const rawStep = (upper - lower) / Math.max(2, targetTicks - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const factor =
    [1, 2, 2.5, 5, 10].toSorted(
      (left, right) => Math.abs(left * magnitude - rawStep) - Math.abs(right * magnitude - rawStep),
    )[0] ?? 1
  const step = factor * magnitude
  const min = Math.floor(lower / step) * step
  const max = Math.ceil(upper / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) =>
    Number((min + index * step).toPrecision(12)),
  )
  return { min, max, ticks }
}
