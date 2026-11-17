'use client'

import { Dialog } from '@base-ui/react/dialog'
import { ChevronRight, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  type AssessmentGrade,
  assessMetric,
  assessmentSources,
  compositionPercentage,
} from '@/health/assessment'
import {
  type Measurement,
  type MetricKey,
  measurementDay,
  metricDefinitions,
  type OwnerHealthSnapshot,
} from '@/health/contracts'

const gradeColors: Record<AssessmentGrade, string> = {
  low: 'text-sky-700 [.dark_&]:text-sky-300',
  standard: 'text-emerald-700 [.dark_&]:text-emerald-300',
  high: 'text-amber-700 [.dark_&]:text-amber-300',
  veryHigh: 'text-orange-700 [.dark_&]:text-orange-300',
  belowReference: 'text-muted-foreground',
  atReference: 'text-muted-foreground',
  aboveReference: 'text-muted-foreground',
  belowBaseline: 'text-muted-foreground',
  atBaseline: 'text-muted-foreground',
  aboveBaseline: 'text-muted-foreground',
  younger: 'text-muted-foreground',
  sameAge: 'text-muted-foreground',
  older: 'text-muted-foreground',
  tracking: 'text-muted-foreground',
  noData: 'text-muted-foreground',
  recorded: 'text-muted-foreground',
}
const bandColors: Partial<Record<AssessmentGrade, string>> = {
  low: 'bg-sky-500',
  standard: 'bg-emerald-500',
  high: 'bg-amber-500',
  veryHigh: 'bg-orange-500',
}

export function HealthMetricAssessment({
  metric,
  row,
  snapshot,
}: {
  metric: MetricKey
  row: Measurement | undefined
  snapshot: OwnerHealthSnapshot
}) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const assessment = assessMetric(metric, row, snapshot.measurements, snapshot.referenceProfile)
  const { bands, grade, value, reference, source } = assessment
  const unit = metricDefinitions.find((item) => item.key === metric)?.unit ?? 'index'
  const format = (number: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(number)
  const percentage =
    metric === 'muscleMass' || metric === 'proteinMass' ? compositionPercentage(row, metric) : null
  const linkedSource =
    source in assessmentSources ? (source as keyof typeof assessmentSources) : null
  const sourceUrl = linkedSource ? assessmentSources[linkedSource] : null
  const selectedBand = bands.findIndex((band) => band.grade === grade)
  const upperBounds = bands.flatMap((band) => (band.upper === null ? [] : [band.upper]))
  const first = upperBounds[0] ?? 0
  const last = upperBounds.at(-1) ?? 1
  const span = Math.max(last - (upperBounds.at(-2) ?? 0), 1)
  const lower = bands[selectedBand - 1]?.upper ?? Math.max(0, first - span)
  const upper = bands[selectedBand]?.upper ?? last + span
  const position =
    value === null || selectedBand < 0
      ? 0
      : ((selectedBand + Math.max(0.03, Math.min(0.97, (value - lower) / (upper - lower)))) /
          bands.length) *
        100
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className={`mt-1 inline-flex min-h-9 max-w-full items-center gap-1 rounded-lg text-left text-xs focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${gradeColors[grade]}`}
        aria-label={t('assessment.open', { metric: t(`metrics.${metric}`) })}
      >
        <span>{t(`assessment.grades.${grade}`)}</span>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl border bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(36rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-semibold text-xl">
                {t(`metrics.${metric}`)}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-muted-foreground text-xs leading-5">
                {t(`assessment.descriptions.${metric}`)}
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={
                <Button
                  className="shrink-0 border bg-card text-foreground hover:bg-muted"
                  aria-label={t('close')}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              }
            />
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <p className="font-semibold text-4xl tabular-nums">
              {value === null ? '—' : format(value)}{' '}
              <span className="font-normal text-muted-foreground text-sm">
                {t(`units.${unit}`)}
              </span>
            </p>
            <p className={`font-medium text-lg ${gradeColors[grade]}`}>
              {t(`assessment.grades.${grade}`)}
            </p>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            {row ? measurementDay(row.measuredAt) : t('noData')}
          </p>
          {percentage !== null && (
            <p className="mt-3 text-sm">
              {t(
                metric === 'muscleMass'
                  ? 'assessment.musclePercentage'
                  : 'assessment.proteinPercentage',
                { value: format(percentage) },
              )}
            </p>
          )}
          {bands.length > 0 && (
            <div className="mt-8 space-y-4" data-testid="assessment-scale">
              <div className="relative flex h-3 gap-px rounded-full bg-muted" aria-hidden="true">
                {bands.map((band, index) => (
                  <span
                    key={band.grade}
                    className={`h-full flex-1 ${bandColors[band.grade] ?? 'bg-muted'} ${index === 0 ? 'rounded-l-full' : ''} ${index === bands.length - 1 ? 'rounded-r-full' : ''}`}
                  />
                ))}
                <span
                  className="absolute -top-3 -translate-x-1/2 text-foreground text-sm"
                  style={{ left: `${position}%` }}
                >
                  ▼
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                {bands.map((band, index) => {
                  const previous = bands[index - 1]
                  const min = previous?.upper
                  const range =
                    min === null || min === undefined
                      ? `${band.inclusive ? '≤' : '<'} ${format(band.upper ?? 0)}`
                      : band.upper === null
                        ? `${previous?.inclusive ? '>' : '≥'} ${format(min)}`
                        : `${format(min)} ${previous?.inclusive ? '<' : '≤'} x ${band.inclusive ? '≤' : '<'} ${format(band.upper)}`
                  return (
                    <li key={band.grade} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 size-2.5 shrink-0 rounded-sm ${bandColors[band.grade]}`}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="block font-medium">
                          {t(`assessment.grades.${band.grade}`)}
                        </span>
                        <span className="mt-1 block text-muted-foreground tabular-nums">
                          {range} {t(`units.${unit}`)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {reference !== null && (
            <div className="mt-5 rounded-xl bg-muted/50 p-4 text-sm">
              <p>
                {t(
                  source === 'baseline' ? 'assessment.baselineValue' : 'assessment.referenceValue',
                  { value: format(reference), unit: t(`units.${unit}`) },
                )}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('assessment.difference', {
                  value: `${(value ?? reference) > reference ? '+' : ''}${format((value ?? reference) - reference)}`,
                  unit: t(`units.${unit}`),
                })}
              </p>
            </div>
          )}
          <div className="mt-6 space-y-3 border-t pt-5 text-sm leading-6">
            <p>{t(`assessment.methods.${source}`)}</p>
            {source === 'baseline' && (
              <p className="text-muted-foreground text-xs">
                {t('assessment.baselineDays', { count: assessment.baselineDays })}
              </p>
            )}
            {assessment.age !== null && assessment.height !== null && snapshot.referenceProfile && (
              <p className="text-muted-foreground text-xs">
                {t('assessment.profile', {
                  age: assessment.age,
                  height: format(assessment.height),
                  sex: t(`assessment.sex.${snapshot.referenceProfile.sex}`),
                })}
              </p>
            )}
            <p className="text-muted-foreground text-xs">{t('assessment.healthReference')}</p>
            {sourceUrl && linkedSource && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-primary underline underline-offset-4"
              >
                {t(`assessment.sources.${linkedSource}`)}
              </a>
            )}
          </div>
          <Dialog.Close render={<Button className="mt-6 w-full">{t('close')}</Button>} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
