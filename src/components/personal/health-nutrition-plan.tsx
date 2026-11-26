'use client'

import { useLocale, useTranslations } from 'next-intl'
import { type NutritionPlan, summarizeNutritionPlan } from '@/health/nutrition-plan'

export function HealthNutritionPlan({ plan }: { plan: NutritionPlan }) {
  const locale = useLocale()
  const t = useTranslations('HealthPlan')
  const { intake, expenditure, deficit } = summarizeNutritionPlan(plan)
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format
  const meals = [
    {
      key: 'breakfast',
      description: t('nutrition_breakfastDescription', plan.breakfast),
      calories: t('nutrition_foodCalories', { value: format(plan.breakfast.calories) }),
    },
    {
      key: 'lunch',
      description: t('nutrition_lunchDescription', { calories: format(plan.lunch.calories) }),
      calories: t('nutrition_foodRange', {
        min: format(plan.lunch.min),
        max: format(plan.lunch.max),
      }),
    },
    {
      key: 'dinner',
      description: t('nutrition_dinnerDescription', {
        scoopMl: plan.dinner.scoopMl,
        calories: format(plan.dinner.calories),
      }),
      calories: t('nutrition_foodRange', {
        min: format(plan.dinner.min),
        max: format(plan.dinner.max),
      }),
    },
    { key: 'water', description: t('nutrition_waterDescription', plan.water), calories: null },
  ] as const
  const budget = [
    { key: 'intake', value: intake },
    { key: 'expenditure', value: expenditure.center, range: expenditure },
    { key: 'deficit', value: deficit.center, range: deficit },
  ] as const
  return (
    <section aria-labelledby="health-nutrition-title">
      <details open className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7">
        <summary id="health-nutrition-title" className="cursor-pointer font-bold text-xl">
          {t('nutrition_title')}
        </summary>
        <p className="text-muted-foreground text-sm">{t('nutrition_intro')}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {meals.map(({ key, description, calories }) => (
            <div key={key} className="rounded-xl border bg-muted/20 p-3">
              <dt className="flex flex-wrap items-baseline justify-between gap-x-3 font-medium text-sm">
                {t(`nutrition_${key}`)}
                {calories && <span className="text-primary tabular-nums">{calories}</span>}
              </dt>
              <dd className="mt-1 text-muted-foreground text-sm leading-6">{description}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-3">
          <h3 className="font-semibold">{t('nutrition_budget')}</h3>
          <dl className="grid gap-3 sm:grid-cols-3">
            {budget.map((item) => (
              <div key={item.key} className="rounded-xl border p-3">
                <dt className="text-muted-foreground text-sm">{t(`nutrition_${item.key}`)}</dt>
                <dd className="mt-1 font-semibold text-2xl tabular-nums">
                  {format(item.value)}{' '}
                  <span className="font-normal text-muted-foreground text-xs">
                    {t('nutrition_dailyUnit')}
                  </span>
                </dd>
                {'range' in item && (
                  <dd className="mt-1 text-muted-foreground text-xs tabular-nums">
                    {t('nutrition_dailyRange', {
                      min: format(item.range.min),
                      max: format(item.range.max),
                    })}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-xs leading-5">
            {t('nutrition_method', {
              intake: format(intake),
              resting: format(plan.expenditure.resting),
              activityMin: format(plan.expenditure.otherActivityMin),
              activityMax: format(plan.expenditure.otherActivityMax),
              runDays: plan.expenditure.runIntervalDays,
              distance: plan.expenditure.runKm,
              runCalories: format(plan.expenditure.runActiveCalories),
            })}
          </p>
        </div>
      </details>
    </section>
  )
}
