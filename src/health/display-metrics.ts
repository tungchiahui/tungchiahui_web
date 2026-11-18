import { type Measurement, type MetricKey, metricDefinitions } from './contracts'

export const compositionDefinitions = [
  { key: 'musclePercentage', mass: 'muscleMass', unit: 'percent' },
  { key: 'proteinPercentage', mass: 'proteinMass', unit: 'percent' },
] as const
export type CompositionMetric = (typeof compositionDefinitions)[number]['key']
export type CompositionMassMetric = (typeof compositionDefinitions)[number]['mass'] | 'fatMass'
export type DisplayMetricKey = MetricKey | CompositionMetric | 'fatMass'
export const displayMetricDefinitions = [
  ...metricDefinitions,
  ...compositionDefinitions,
  { key: 'fatMass', unit: 'kg' },
] as const

export function compositionMassMetric(metric: DisplayMetricKey): CompositionMassMetric | null {
  switch (metric) {
    case 'musclePercentage':
    case 'muscleMass':
      return 'muscleMass'
    case 'proteinPercentage':
    case 'proteinMass':
      return 'proteinMass'
    case 'bodyFat':
    case 'fatMass':
      return 'fatMass'
    default:
      return null
  }
}

export function compositionPercentageMetric(metric: CompositionMassMetric) {
  switch (metric) {
    case 'muscleMass':
      return 'musclePercentage'
    case 'proteinMass':
      return 'proteinPercentage'
    case 'fatMass':
      return 'bodyFat'
  }
}

export function compositionPercentage(row: Measurement | undefined, metric: CompositionMassMetric) {
  if (metric === 'fatMass') return row && !row.excluded ? row.bodyFat : null
  if (
    !row ||
    row.excluded ||
    row.weight === null ||
    row[metric] === null ||
    row[metric] > row.weight
  )
    return null
  return (row[metric] / row.weight) * 100
}

export function displayMetricValue(row: Measurement | undefined, metric: DisplayMetricKey) {
  if (!row || row.excluded) return null
  if (metric === 'fatMass')
    return row.weight === null || row.bodyFat === null ? null : (row.weight * row.bodyFat) / 100
  if (metric === 'musclePercentage') return compositionPercentage(row, 'muscleMass')
  if (metric === 'proteinPercentage') return compositionPercentage(row, 'proteinMass')
  return row[metric]
}
