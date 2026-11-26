import { type Measurement, type MetricKey, metricDefinitions } from './contracts'

export const compositionDefinitions = [
  { key: 'musclePercentage', mass: 'muscleMass', unit: 'percent' },
  { key: 'proteinPercentage', mass: 'proteinMass', unit: 'percent' },
] as const
export type CompositionMetric = (typeof compositionDefinitions)[number]['key']
export type CompositionMassMetric =
  | (typeof compositionDefinitions)[number]['mass']
  | 'fatMass'
  | 'waterMass'
export type DisplayMetricKey = MetricKey | CompositionMetric | 'fatMass' | 'leanMass' | 'waterMass'
export const displayMetricDefinitions = [
  ...metricDefinitions,
  ...compositionDefinitions,
  { key: 'fatMass', unit: 'kg' },
  { key: 'leanMass', unit: 'kg' },
  { key: 'waterMass', unit: 'kg' },
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
    case 'bodyWater':
    case 'waterMass':
      return 'waterMass'
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
    case 'waterMass':
      return 'bodyWater'
  }
}

export function compositionPercentage(row: Measurement | undefined, metric: CompositionMassMetric) {
  if (metric === 'fatMass' || metric === 'waterMass')
    return row && !row.excluded ? row[metric === 'fatMass' ? 'bodyFat' : 'bodyWater'] : null
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
  if (metric === 'fatMass' || metric === 'leanMass') {
    if (row.weight === null || row.bodyFat === null) return null
    const fatMass = (row.weight * row.bodyFat) / 100
    return metric === 'fatMass' ? fatMass : row.weight - fatMass
  }
  if (metric === 'waterMass')
    return row.weight === null || row.bodyWater === null ? null : (row.weight * row.bodyWater) / 100
  if (metric === 'musclePercentage') return compositionPercentage(row, 'muscleMass')
  if (metric === 'proteinPercentage') return compositionPercentage(row, 'proteinMass')
  return row[metric]
}
