import { describe, expect, it } from 'vitest'
import { titleTextFromBlock, titleTranslationBlock } from '../../src/translation/document-fields'
import { memoryEntryKey, validateMemoryEntry } from '../../src/translation/git-memory'
import repairs from '../fixtures/translation/wiki-title-repairs.json'

describe('Reviewed Wiki title gaps', () => {
  it.each(repairs)(
    'preserves the source identity and Markdown protection for $source',
    ({ source, target, key }) => {
      const block = titleTranslationBlock(source)
      expect(memoryEntryKey(block)).toBe(key)
      const entry = validateMemoryEntry(key, {
        normalizationVersion: block.normalizationVersion,
        sourceHash: block.sourceHash,
        contextFingerprint: block.contextFingerprint,
        sourceText: block.sourceText,
        translatedText: `# ${target}`,
        provider: 'manual',
        model: 'codex-semantic-review',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      })
      expect(titleTextFromBlock(entry.translatedText)).toBe(target)
      expect(titleTextFromBlock(entry.sourceText)).toBe(source)
      expect(target).not.toMatch(/[\p{Script=Han}]/u)
      expect(() =>
        validateMemoryEntry(key, { ...entry, translatedText: `# ${target}\n\nExtra body` }),
      ).toThrow()
    },
  )
})
