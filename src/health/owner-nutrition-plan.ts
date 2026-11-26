import { nutritionPlanSchema } from './nutrition-plan'

export const ownerNutritionPlan = nutritionPlanSchema.parse({
  breakfast: {
    breadGrams: 45,
    breadSlices: 2,
    milkMl: 200,
    calories: 235,
    proteinGrams: 10.9,
  },
  lunch: { calories: 1000, min: 700, max: 1100 },
  dinner: { scoopMl: 30, calories: 190, min: 160, max: 225 },
  water: { minLiters: 2, maxLiters: 3 },
  expenditure: {
    resting: 1780,
    otherActivityMin: 700,
    otherActivityCenter: 800,
    otherActivityMax: 900,
    runKm: 6,
    runIntervalDays: 2,
    runActiveCalories: 550,
  },
})
