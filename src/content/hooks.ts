import { z } from 'zod'

export const contentChangeSchema = z
  .object({
    documentId: z.uuid(),
    previousRoutePath: z.string().startsWith('/').optional(),
    routePath: z.string().startsWith('/'),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    type: z.enum(['added', 'deleted', 'modified', 'moved']),
  })
  .strict()

export const contentHookInputSchema = z
  .object({
    changes: z.array(contentChangeSchema),
    sourceCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  })
  .strict()

export type ContentChange = Readonly<z.infer<typeof contentChangeSchema>>
export type ContentHookInput = Readonly<z.infer<typeof contentHookInputSchema>>

export interface ContentIngestionHooks {
  diffTranslations(input: ContentHookInput): Promise<void>
  refreshSearch(input: ContentHookInput): Promise<void>
  revalidatePublicContent(input: ContentHookInput): Promise<void>
}

export class DeferredPhaseContentHooks implements ContentIngestionHooks {
  async diffTranslations(input: ContentHookInput) {
    this.#log('translation_diff_deferred', 8, input)
  }

  async refreshSearch(input: ContentHookInput) {
    this.#log('search_refresh_deferred', 10, input)
  }

  async revalidatePublicContent(input: ContentHookInput) {
    this.#log('public_content_revalidation_deferred', 6, input)
  }

  #log(event: string, replacementPhase: number, input: ContentHookInput) {
    console.log(
      JSON.stringify({
        changedDocuments: input.changes.length,
        event,
        replacementPhase,
        sourceCommit: input.sourceCommit,
      }),
    )
  }
}

export class CompositeContentHooks implements ContentIngestionHooks {
  readonly #hooks: readonly ContentIngestionHooks[]

  constructor(hooks: readonly ContentIngestionHooks[]) {
    this.#hooks = hooks
  }

  async diffTranslations(input: ContentHookInput) {
    await Promise.all(this.#hooks.map((hook) => hook.diffTranslations(input)))
  }

  async refreshSearch(input: ContentHookInput) {
    await Promise.all(this.#hooks.map((hook) => hook.refreshSearch(input)))
  }

  async revalidatePublicContent(input: ContentHookInput) {
    await Promise.all(this.#hooks.map((hook) => hook.revalidatePublicContent(input)))
  }
}

export class RecordingContentHooks implements ContentIngestionHooks {
  readonly calls: ContentHookInput[] = []

  async diffTranslations(input: ContentHookInput) {
    this.calls.push(input)
  }

  async refreshSearch(input: ContentHookInput) {
    this.calls.push(input)
  }

  async revalidatePublicContent(input: ContentHookInput) {
    this.calls.push(input)
  }
}
