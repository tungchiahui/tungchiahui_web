import { describe, expect, it } from 'vitest'

import {
  ownerDatasetUpdateSchema,
  serviceIdentityContracts,
} from '../../src/control-plane/contracts'

describe('control-plane contracts', () => {
  it('validates the exact tech-footprint payload shape', () => {
    expect(
      ownerDatasetUpdateSchema.parse({
        datasetKey: 'tech_footprint',
        expectedRevision: 3,
        payload: {
          records: {
            'y1a/cpp-linux/cpp': {
              note: 'Review RAII',
              progress: 50,
              status: 'doing',
              updatedAt: '2026-08-24T12:00:00.000Z',
            },
          },
          version: 2,
        },
      }),
    ).toBeTruthy()
    expect(() =>
      ownerDatasetUpdateSchema.parse({
        datasetKey: 'tech_footprint',
        expectedRevision: 3,
        payload: {
          records: {
            invalid: {
              note: '',
              progress: 100,
              status: 'todo',
              updatedAt: 'not-a-date',
            },
          },
          version: 2,
        },
      }),
    ).toThrow()
  })

  it('validates weight metrics, target ranges and unique record dates', () => {
    const valid = {
      datasetKey: 'weight_loss',
      expectedRevision: 0,
      payload: {
        records: [
          {
            bodyFat: '25.5',
            date: '2026-06-11',
            muscleMass: '',
            note: '',
            targetMax: 98,
            targetMin: 98,
            waist: '99',
            weight: '97.5',
          },
        ],
        version: 2,
      },
    }
    expect(ownerDatasetUpdateSchema.parse(valid)).toBeTruthy()
    expect(() =>
      ownerDatasetUpdateSchema.parse({
        ...valid,
        payload: {
          ...valid.payload,
          records: [valid.payload.records[0], valid.payload.records[0]],
        },
      }),
    ).toThrow('record dates must be unique')
  })

  it('keeps service privileges separated by contract', () => {
    expect(serviceIdentityContracts['control-api']).toMatchObject({
      dockerSocket: false,
      executesLongRunningWork: false,
      hostShell: false,
      openRestyAdmin: false,
    })
    expect(serviceIdentityContracts['content-worker']).toMatchObject({
      controlStateWrite: false,
      dockerSocket: false,
      hostShell: false,
      openRestyAdmin: false,
    })
    expect(serviceIdentityContracts['deploy-agent']).toMatchObject({
      applicationJobWrite: false,
      paidAiCredential: false,
    })
  })
})
