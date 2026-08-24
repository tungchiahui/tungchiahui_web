export type ContentChange = Readonly<{
  documentId: string
  routePath: string
  sourceHash: string
  type: 'added' | 'deleted' | 'modified' | 'moved'
}>

export type ContentHookInput = Readonly<{
  changes: readonly ContentChange[]
  sourceCommit: string
}>

export interface ContentIngestionHooks {
  diffTranslations(input: ContentHookInput): Promise<void>
  refreshSearch(input: ContentHookInput): Promise<void>
  revalidateZhCn(input: ContentHookInput): Promise<void>
}

export class DeferredPhaseContentHooks implements ContentIngestionHooks {
  async diffTranslations(input: ContentHookInput) {
    this.#log('translation_diff_deferred', 8, input)
  }

  async refreshSearch(input: ContentHookInput) {
    this.#log('search_refresh_deferred', 10, input)
  }

  async revalidateZhCn(input: ContentHookInput) {
    this.#log('zh_cn_revalidation_deferred', 6, input)
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

export class RecordingContentHooks implements ContentIngestionHooks {
  readonly calls: ContentHookInput[] = []

  async diffTranslations(input: ContentHookInput) {
    this.calls.push(input)
  }

  async refreshSearch(input: ContentHookInput) {
    this.calls.push(input)
  }

  async revalidateZhCn(input: ContentHookInput) {
    this.calls.push(input)
  }
}
