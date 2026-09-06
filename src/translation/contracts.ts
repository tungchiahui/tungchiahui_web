import { z } from 'zod'

import { translationExecutionModeSchema, translationScopeSchema } from '../domain/persistence'

const translationBudgetSchema = z.number().finite().nonnegative().max(10_000)

export const translationOperationRequestSchema = z
  .object({
    articleSourcePath: z.string().trim().min(1).max(1_000).optional(),
    budgetUsd: translationBudgetSchema.optional(),
    executionConfirmation: z.literal('EXECUTE_PAID_TRANSLATION').optional(),
    force: z.boolean().default(false),
    mode: translationExecutionModeSchema,
    retranslationConfirmation: z.literal('RETRANSLATE').optional(),
    scope: translationScopeSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if ((request.scope === 'article') !== (request.articleSourcePath !== undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'articleSourcePath is required only for article scope',
        path: ['articleSourcePath'],
      })
    }
    if (request.mode === 'execute') {
      if (request.budgetUsd === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'budgetUsd is required for execute mode',
          path: ['budgetUsd'],
        })
      }
      if (request.executionConfirmation !== 'EXECUTE_PAID_TRANSLATION') {
        context.addIssue({
          code: 'custom',
          message: 'explicit paid-translation confirmation is required',
          path: ['executionConfirmation'],
        })
      }
    }
    if (request.mode === 'dry-run' && request.budgetUsd !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'dry-run does not accept a budget',
        path: ['budgetUsd'],
      })
    }
    if (request.force && request.retranslationConfirmation !== 'RETRANSLATE') {
      context.addIssue({
        code: 'custom',
        message: 'force requires the RETRANSLATE confirmation',
        path: ['retranslationConfirmation'],
      })
    }
  })

export type TranslationOperationRequest = Readonly<
  z.infer<typeof translationOperationRequestSchema>
>

export const translationJobProgressSchema = z
  .object({
    completedSegmentIds: z.array(z.uuid()),
    documentsAffected: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().finite().nonnegative(),
    estimatedInputTokens: z.number().int().nonnegative(),
    estimatedOutputTokens: z.number().int().nonnegative(),
    phase: z.enum(['planned', 'translating', 'revalidating', 'completed']),
    plannedSegmentIds: z.array(z.uuid()),
    providerCalls: z.number().int().nonnegative(),
    revalidationDocumentIds: z.array(z.uuid()),
  })
  .strict()

export type TranslationJobProgress = Readonly<z.infer<typeof translationJobProgressSchema>>
