import { type HealthReferenceProfile, type Measurement, measurementDay } from './contracts'
import {
  compositionPercentageMetric,
  type DisplayMetricKey,
  displayMetricValue,
} from './display-metrics'
import { metricSeries } from './trends'

export { compositionPercentage } from './display-metrics'

export type AssessmentGrade =
  | 'low'
  | 'standard'
  | 'high'
  | 'veryHigh'
  | 'good'
  | 'dangerous'
  | 'belowReference'
  | 'atReference'
  | 'aboveReference'
  | 'belowBaseline'
  | 'atBaseline'
  | 'aboveBaseline'
  | 'younger'
  | 'sameAge'
  | 'older'
  | 'tracking'
  | 'noData'
  | 'recorded'
export type AssessmentSource =
  | 'chinaBmi'
  | 'chinaFat'
  | 'chinaWaist'
  | 'water'
  | 'heart'
  | 'mifflin'
  | 'age'
  | 'baseline'
  | 'recorded'
  | 'xiaomiReport'
export type AssessmentBand = {
  upper: number | null
  inclusive: boolean
  grade: AssessmentGrade
}
export type MetricAssessment = {
  grade: AssessmentGrade
  source: AssessmentSource
  bands: AssessmentBand[]
  value: number | null
  reference: number | null
  baselineDays: number
  age: number | null
  height: number | null
  prediction: number | null
  reportDate: string | null
}

export const assessmentSources = {
  chinaBmi:
    'https://www.nhc.gov.cn/wjw/ylyjs/202412/b3d40e0141834897808ce6c9dce76a60/files/1736390749000_59785.pdf',
  chinaFat: 'https://cmab.yiigle.com/uploads/guide_html/肥胖症基层诊疗指南（2019年）.html',
  chinaWaist:
    'https://www.nhc.gov.cn/wjw/ylyjs/202412/b3d40e0141834897808ce6c9dce76a60/files/1736390749000_59785.pdf',
  water: 'https://tanita.eu/understanding-your-measurements/body-water',
  heart:
    'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse',
  mifflin: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  xiaomiReport: 'https://www.mi.com/my/support/faq/details/KA-491599/',
} as const

export function ageOnMeasurement(birthDate: string, measuredAt: string) {
  const day = measurementDay(measuredAt)
  return (
    Number(day.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    Number(day.slice(5) < birthDate.slice(5))
  )
}

function bands(upperBounds: number[], grades: AssessmentGrade[], inclusive: boolean[] = []) {
  return grades.map(
    (grade, index): AssessmentBand => ({
      upper: upperBounds[index] ?? null,
      inclusive: inclusive[index] ?? false,
      grade,
    }),
  )
}

function compare(value: number, reference: number) {
  // Compare at the same precision used for dashboard values.
  return Math.sign(Math.round(value * 100) - Math.round(reference * 100))
}

export function assessMetric(
  metric: DisplayMetricKey,
  row: Measurement | undefined,
  records: Measurement[],
  profile: HealthReferenceProfile | undefined,
): MetricAssessment {
  const massFromPercentage = metric === 'fatMass' || metric === 'waterMass'
  if (metric === 'musclePercentage' || metric === 'proteinPercentage' || massFromPercentage) {
    const referenceMetric = massFromPercentage
      ? compositionPercentageMetric(metric)
      : metric === 'musclePercentage'
        ? 'muscleMass'
        : 'proteinMass'
    const assessment = assessMetric(referenceMetric, row, records, profile)
    const value = displayMetricValue(row, metric)
    if (!row || row.weight === null || value === null)
      return { ...assessment, value: null, grade: 'noData', bands: [], reference: null }
    const factor = massFromPercentage ? row.weight / 100 : 100 / row.weight
    return {
      ...assessment,
      value,
      bands: assessment.bands.map((band) => ({
        ...band,
        upper: band.upper === null ? null : band.upper * factor,
      })),
      reference: assessment.reference === null ? null : assessment.reference * factor,
    }
  }
  const age = row && profile ? ageOnMeasurement(profile.birthDate, row.measuredAt) : null
  const height = row?.height ?? profile?.height ?? null
  const result: MetricAssessment = {
    grade: 'noData',
    source: 'recorded',
    bands: [],
    value: displayMetricValue(row, metric),
    reference: null,
    baselineDays: 0,
    age,
    height,
    prediction: null,
    reportDate: null,
  }
  if (!row || row.excluded || result.value === null) return { ...result, value: null }
  if (metric === 'height' || metric === 'physiqueRating') return { ...result, grade: 'recorded' }
  if (
    metric === 'basalMetabolism' &&
    profile &&
    age !== null &&
    age >= 19 &&
    age <= 78 &&
    row.weight !== null &&
    height
  ) {
    result.prediction =
      10 * row.weight + 6.25 * height - 5 * age + (profile.sex === 'male' ? 5 : -161)
  }
  const report = profile?.reportReference
  if (report && report.height === height && report.sex === profile.sex && report.age === age) {
    switch (metric) {
      case 'muscleMass':
        result.bands = bands([...report.muscleMass], ['low', 'standard', 'good'], [false, true])
        break
      case 'proteinMass':
        result.bands = bands(
          report.proteinPercentage.map((value) => (value * report.weight) / 100),
          ['low', 'standard', 'high'],
          [false, true],
        )
        break
      case 'basalMetabolism':
        result.bands = bands(
          [...report.basalMetabolism],
          ['low', 'standard', 'high'],
          [false, true],
        )
        break
      case 'visceralFat':
        result.bands = bands([...report.visceralFat], ['standard', 'high', 'veryHigh', 'dangerous'])
        break
    }
    if (result.bands.length) {
      const value = result.value
      const band = result.bands.find(
        ({ upper, inclusive }) => upper === null || value < upper || (inclusive && value === upper),
      )
      return {
        ...result,
        grade: band?.grade ?? 'tracking',
        source: 'xiaomiReport',
        reportDate: report.measuredOn,
      }
    }
  }

  if (profile && age !== null && age >= 18 && age <= 79) {
    switch (metric) {
      case 'weight':
        if (height) {
          const factor = (height / 100) ** 2
          result.bands = bands(
            [18.5, 24, 28].map((value) => value * factor),
            ['low', 'standard', 'high', 'veryHigh'],
          )
          result.source = 'chinaBmi'
        }
        break
      case 'bmi':
        result.bands = bands([18.5, 24, 28], ['low', 'standard', 'high', 'veryHigh'])
        result.source = 'chinaBmi'
        break
      case 'bodyFat':
        result.bands = bands(
          profile.sex === 'male' ? [10, 20, 25] : [15, 25, 30],
          ['low', 'standard', 'high', 'veryHigh'],
          [false, true, true],
        )
        result.source = 'chinaFat'
        break
      case 'bodyWater':
        result.bands = bands(
          profile.sex === 'male' ? [50, 65] : [45, 60],
          ['low', 'standard', 'high'],
          [false, true],
        )
        result.source = 'water'
        break
      case 'waist':
        result.bands = bands(profile.sex === 'male' ? [85, 90] : [80, 85], [
          'standard',
          'high',
          'veryHigh',
        ])
        result.source = 'chinaWaist'
        break
      case 'heartRate':
        result.bands = bands([60, 100], ['low', 'standard', 'high'], [false, true])
        result.source = 'heart'
        break
      case 'basalMetabolism':
        // Mifflin–St Jeor predicts resting energy expenditure. Comparison is
        // labelled as a model reference, without assigning a health category.
        if (result.prediction !== null) {
          const reference = result.prediction
          const grade =
            (['belowReference', 'atReference', 'aboveReference'] as const)[
              compare(result.value, reference) + 1
            ] ?? 'atReference'
          return { ...result, reference, grade, source: 'mifflin' }
        }
        break
      case 'metabolicAge': {
        const grade =
          (['younger', 'sameAge', 'older'] as const)[compare(result.value, age) + 1] ?? 'sameAge'
        return { ...result, reference: age, grade, source: 'age' }
      }
      case 'leanMass':
      case 'muscleMass':
      case 'skeletalMuscleMass':
      case 'boneMass':
      case 'proteinMass':
      case 'visceralFat':
      case 'bodyScore':
        break
      default:
        metric satisfies never
    }
  }
  if (result.bands.length) {
    const value = result.value
    const band = result.bands.find(
      ({ upper, inclusive }) => upper === null || value < upper || (inclusive && value === upper),
    )
    return { ...result, grade: band?.grade ?? 'tracking' }
  }
  // Device-specific scores and composition masses lack interchangeable national
  // cutoffs. Compare with the owner's preceding 30 calendar days, daily weighted.
  const day = measurementDay(row.measuredAt)
  const from = new Date(Date.parse(day) - 30 * 86400000).toISOString().slice(0, 10)
  const to = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)
  const matchingRecords = records.filter(
    (candidate) =>
      candidate.source === row.source &&
      (row.source !== 'smartscale' || candidate.rawPayload?.Source === row.rawPayload?.Source),
  )
  const daily = metricSeries(matchingRecords, metric, 'daily', from, to)
  if (daily.length < 3)
    return { ...result, grade: 'tracking', source: 'baseline', baselineDays: daily.length }
  const reference = daily.reduce((sum, point) => sum + point.value, 0) / daily.length
  const grade =
    (['belowBaseline', 'atBaseline', 'aboveBaseline'] as const)[
      compare(result.value, reference) + 1
    ] ?? 'atBaseline'
  return { ...result, reference, grade, source: 'baseline', baselineDays: daily.length }
}
