import { type Measurement, type MetricKey, metricDefinitions } from './contracts'

export const compositionDefinitions = [
  { key: 'musclePercentage', mass: 'muscleMass', unit: 'percent' },
  { key: 'proteinPercentage', mass: 'proteinMass', unit: 'percent' },
] as const
export type CompositionMetric = (typeof compositionDefinitions)[number]['key']
export type CompositionMassMetric = (typeof compositionDefinitions)[number]['mass']
export type DisplayMetricKey = MetricKey | CompositionMetric
export const displayMetricDefinitions = [...metricDefinitions, ...compositionDefinitions]

export function compositionMassMetric(metric: DisplayMetricKey): CompositionMassMetric | null {
  switch (metric) {
    case 'musclePercentage':
    case 'muscleMass':
      return 'muscleMass'
    case 'proteinPercentage':
    case 'proteinMass':
      return 'proteinMass'
    default:
      return null
  }
}

export function compositionPercentage(row: Measurement | undefined, metric: CompositionMassMetric) {
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
  if (metric === 'musclePercentage') return compositionPercentage(row, 'muscleMass')
  if (metric === 'proteinPercentage') return compositionPercentage(row, 'proteinMass')
  return row[metric]
}
