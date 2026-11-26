import { bodyTargetPlanSchema } from '../../src/health/contracts'

export const syntheticBodyTargets = bodyTargetPlanSchema.parse({
  versionDate: '2026-12-02',
  points: [
    {
      date: '2026-12-02',
      weight: 85.5,
      bodyFat: 24.4,
      fatMass: 20.9,
      leanMass: 64.6,
      muscleMass: 60,
      skeletalMuscleMass: 33,
      proteinMass: 13,
      waterMass: 46,
      bodyWater: 53.8,
      bmi: 27,
      basalMetabolism: 1750,
    },
    {
      date: '2027-01-10',
      weight: 78.5,
      bodyFat: 20,
      fatMass: 15.7,
      leanMass: 62.8,
      muscleMass: 59,
      skeletalMuscleMass: 32,
      proteinMass: 12.5,
      waterMass: 45,
      bodyWater: 57.3,
      bmi: 24.8,
      basalMetabolism: 1700,
    },
  ],
})
