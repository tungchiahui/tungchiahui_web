export const publicNutritionPlan = {
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
} as const

export function summarizeNutritionPlan(plan: {
  breakfast: { calories: number }
  lunch: { calories: number }
  dinner: { calories: number }
  expenditure: {
    resting: number
    otherActivityMin: number
    otherActivityCenter: number
    otherActivityMax: number
    runIntervalDays: number
    runActiveCalories: number
  }
}) {
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
