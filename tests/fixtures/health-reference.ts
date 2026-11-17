import { healthReferenceProfileSchema } from '../../src/health/contracts'

export const syntheticReportProfile = healthReferenceProfileSchema.parse({
  height: 178,
  sex: 'male',
  birthDate: '2000-02-04',
  reportReference: {
    measuredOn: '2026-11-17',
    age: 26,
    height: 178,
    sex: 'male',
    weight: 87,
    muscleMass: [49.4, 62.4],
    proteinPercentage: [10.3, 17.7],
    basalMetabolism: [1317.5, 1782.5],
    visceralFat: [4.5, 9.5, 14.5],
  },
})
