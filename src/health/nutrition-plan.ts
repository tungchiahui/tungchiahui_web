import { z } from 'zod'

const calorieRangeSchema = z
  .object({
    calories: z.number().positive(),
    min: z.number().positive(),
    max: z.number().positive(),
  })
  .refine(({ min, calories, max }) => min <= calories && calories <= max)

export const nutritionPlanSchema = z.object({
  breakfast: z.object({
    breadGrams: z.number().positive(),
    breadSlices: z.number().int().positive(),
    milkMl: z.number().positive(),
    calories: z.number().positive(),
    proteinGrams: z.number().nonnegative(),
  }),
  lunch: calorieRangeSchema,
  dinner: calorieRangeSchema.safeExtend({ scoopMl: z.number().positive() }),
  water: z
    .object({ minLiters: z.number().positive(), maxLiters: z.number().positive() })
    .refine(({ minLiters, maxLiters }) => minLiters <= maxLiters),
  expenditure: z
    .object({
      resting: z.number().positive(),
      otherActivityMin: z.number().nonnegative(),
      otherActivityCenter: z.number().nonnegative(),
      otherActivityMax: z.number().nonnegative(),
      runKm: z.number().positive(),
      runIntervalDays: z.number().positive(),
      runActiveCalories: z.number().nonnegative(),
    })
    .refine(
      ({ otherActivityMin, otherActivityCenter, otherActivityMax }) =>
        otherActivityMin <= otherActivityCenter && otherActivityCenter <= otherActivityMax,
    ),
})

export type NutritionPlan = z.infer<typeof nutritionPlanSchema>

export function summarizeNutritionPlan(plan: NutritionPlan) {
  const intake = plan.breakfast.calories + plan.lunch.calories + plan.dinner.calories
  const activity = plan.expenditure
  const dailyRunning = activity.runActiveCalories / activity.runIntervalDays
  const restingAndRunning = activity.resting + dailyRunning
  const expenditure = {
    min: restingAndRunning + activity.otherActivityMin,
    center: restingAndRunning + activity.otherActivityCenter,
    max: restingAndRunning + activity.otherActivityMax,
  }
  return {
    intake,
    expenditure,
    deficit: {
      min: expenditure.min - intake,
      center: expenditure.center - intake,
      max: expenditure.max - intake,
    },
  }
}
