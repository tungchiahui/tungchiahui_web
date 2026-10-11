import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { localizeContentText } from '../../src/i18n/content'
import { materializePublicDocument } from '../../src/server/public-content'
import {
  documentFieldSourceHash,
  documentTranslationFields,
  titleTextFromBlock,
  titleTranslationBlock,
} from '../../src/translation/document-fields'
import { memoryEntryKey } from '../../src/translation/git-memory'
import {
  createTranslationTextTemplate,
  segmentMarkdownForTranslation,
} from '../../src/translation/segmentation'
import { groupWikiDocuments } from '../../src/web/content-compatibility'

const source = '---\ntitle: 中文文档\n---\n\n# 正文标题\n\n内容。'
const row = {
  contentType: 'wiki',
  id: '10000000-0000-4000-8000-000000000001',
  title: '中文文档',
  sourcePath: 'content/wiki/2026-01-01-机器人教程/0100-开始.md',
  rawMarkdown: source,
  rawFrontmatter: { title: '中文文档' },
  sourceHash: 'a'.repeat(64),
  routePath: '/wiki/ji-qi-ren/0100-kai-shi',
  sourceUpdatedAt: null,
  localizedMarkdown: '# Body heading\n\nContent.',
  localizedLocale: 'en-us',
  localizedSourceHash: 'a'.repeat(64),
  fallbackSegmentCount: 0,
  pendingSegmentCount: 0,
  translatedSegmentCount: 2,
  translationMemoryHits: 2,
  translatedFields: { title: 'Chinese document', wikiGroupTitle: 'Robot tutorial' },
  fieldSourceHash: documentFieldSourceHash(
    '中文文档',
    'content/wiki/2026-01-01-机器人教程/0100-开始.md',
  ),
}

describe('Document title memory and locale views', () => {
  it('isolates frontmatter title and Wiki directory name from the body and preserves body identities', () => {
    const fields = documentTranslationFields(source, row.sourcePath)
    const originalTitle = fields[0]?.block
    const changedTitle = documentTranslationFields(
      source.replace('title: 中文文档', 'title: 新文档'),
      row.sourcePath,
    )[0]?.block
    const movedTitle = documentTranslationFields(source, 'content/wiki/机器人教程/0200-移动.md')[0]
      ?.block
    if (!originalTitle || !changedTitle || !movedTitle) throw new Error('Missing title fixture')
    expect(fields.map((field) => field.sourceText)).toEqual(['中文文档', '机器人教程'])
    const changed = source.replace('title: 中文文档', 'title: 新文档')
    expect(memoryEntryKey(changedTitle)).not.toBe(memoryEntryKey(originalTitle))
    expect(segmentMarkdownForTranslation(changed).slice(1).map(memoryEntryKey)).toEqual(
      segmentMarkdownForTranslation(source).slice(1).map(memoryEntryKey),
    )
    expect(memoryEntryKey(movedTitle)).toBe(memoryEntryKey(originalTitle))
  })
  it('escapes literal title syntax and preserves complete identifiers in provider text', () => {
    const title = 'ROS2_Control 与 v1.2 [测试] <标签> *星号*'
    const block = titleTranslationBlock(title)
    expect(titleTextFromBlock(block.sourceText)).toBe(title)
    const template = createTranslationTextTemplate(block.sourceText)
    expect(template.texts.join()).not.toContain('Control')
    const target = template.assemble(
      template.texts.map((text) =>
        text
          .replace('与', 'and')
          .replace('测试', 'test')
          .replace('标签', 'tag')
          .replace('星号', 'star'),
      ),
    )
    expect(titleTextFromBlock(target)).toContain('ROS2_Control and v1.2')
    expect(() => titleTranslationBlock('坏\0标题')).toThrow()
    expect(() => titleTextFromBlock('# Title\n\nBody')).toThrow()
    const formulaTitle = '计算 $x^2$ 与 `ROS2_Control`'
    const formulaBlock = titleTranslationBlock(formulaTitle)
    expect(titleTextFromBlock(formulaBlock.sourceText)).toBe(formulaTitle)
    expect(createTranslationTextTemplate(formulaBlock.sourceText).texts.join()).not.toContain('x^2')
  })
  it('uses current English titles throughout public document views and no-index Wiki groups', () => {
    const english = materializePublicDocument(row, 'en-us')
    expect(english.title).toBe('Chinese document')
    expect(english.canonicalTitle).toBe('中文文档')
    expect(english.contentLocaleState).toBe('translated')
    expect(groupWikiDocuments([english])[0]?.title).toBe('Robot tutorial')
    expect(english.routePath).toBe(row.routePath)
    for (const locale of ['zh-cn', 'zh-hk', 'zh-tw'] as const) {
      const document = materializePublicDocument(row, locale)
      expect(document.title).toBe('中文文档')
      expect(localizeContentText(document.title, locale)).not.toContain('Chinese')
    }
  })
  it('rejects stale or deleted title materializations and indicates mixed title fallback', () => {
    const stale = materializePublicDocument(
      { ...row, localizedSourceHash: 'b'.repeat(64) },
      'en-us',
    )
    expect(stale.title).toBe('中文文档')
    const missing = materializePublicDocument({ ...row, translatedFields: {} }, 'en-us')
    expect(missing.title).toBe('中文文档')
    expect(missing.wikiGroupTitle).toBe('机器人教程')
    expect(missing.contentLocaleState).toBe('mixed')
    expect(materializePublicDocument({ ...row, title: '变更标题' }, 'en-us').title).toBe('变更标题')
    expect(() =>
      materializePublicDocument({ ...row, translatedFields: { path: 'changed-route' } }, 'en-us'),
    ).toThrow()
  })
})
