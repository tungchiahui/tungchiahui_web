import type { ContentHookInput, ContentIngestionHooks } from '../content/hooks'
import { locales } from '../i18n/locales'
import { SearchIndexRepository } from './repository'

export class SearchRefreshContentHook implements ContentIngestionHooks {
  readonly #search: SearchIndexRepository

  constructor(connectionString: string) {
    this.#search = new SearchIndexRepository(connectionString)
  }

  async close() {
    await this.#search.close()
  }

  async diffTranslations() {}

  async refreshSearch(input: ContentHookInput) {
    if (input.changes.length === 0) return
    const searchLocales = input.searchLocales ?? locales
    const refreshedRows = await this.#search.refreshDocuments(
      input.changes.map((change) => change.documentId),
      searchLocales,
    )
    console.log(
      JSON.stringify({
        changedDocuments: input.changes.length,
        event: 'search_projection_refreshed',
        locales: searchLocales,
        refreshedRows,
        sourceCommit: input.sourceCommit,
      }),
    )
  }

  async revalidatePublicContent() {}
}
