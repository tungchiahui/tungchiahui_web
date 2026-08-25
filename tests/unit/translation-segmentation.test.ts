import { describe, expect, it } from 'vitest'

import {
  createTargetedPatchContext,
  isSafeTranslationCandidate,
  materializeTranslatedMarkdown,
  segmentMarkdownForTranslation,
} from '../../src/translation/segmentation'

const markdown = `---
title: 语义分块
---

# 当前标题

保留 \`ROS2_Control\` 与 [官方文档](https://example.com/docs)。

\`\`\`ts
const identity = 'ROS2_Control'
\`\`\`
`

describe('semantic translation segmentation', () => {
  it('creates stable block identities independent of document position', () => {
    const original = segmentMarkdownForTranslation(markdown)
    const inserted = segmentMarkdownForTranslation(
      markdown.replace('# 当前标题', '补充说明。\n\n# 当前标题'),
    )
    const originalHeading = original.find((block) => block.sourceAstType === 'heading')
    const movedHeading = inserted.find((block) => block.sourceAstType === 'heading')

    expect(original.map((block) => [block.sourceAstType, block.isTranslatable])).toEqual([
      ['yaml', false],
      ['heading', true],
      ['paragraph', true],
      ['code', false],
    ])
    expect(movedHeading?.ordinal).not.toBe(originalHeading?.ordinal)
    expect(movedHeading?.sourceHash).toBe(originalHeading?.sourceHash)
    expect(movedHeading?.contextFingerprint).toBe(originalHeading?.contextFingerprint)
  })

  it('accepts only translations that preserve AST shape and protected syntax', () => {
    const paragraph = segmentMarkdownForTranslation(markdown).find(
      (block) => block.sourceAstType === 'paragraph',
    )
    expect(paragraph).toBeDefined()
    expect(
      isSafeTranslationCandidate(
        paragraph,
        'Keep `ROS2_Control` and the [official documentation](https://example.com/docs).',
      ),
    ).toBe(true)
    expect(
      isSafeTranslationCandidate(
        paragraph,
        'Keep `changed_identifier` and the [official documentation](https://evil.example/).',
      ),
    ).toBe(false)
  })

  it('materializes translated and fallback blocks without changing protected blocks', () => {
    const blocks = segmentMarkdownForTranslation(markdown)
    const heading = blocks.find((block) => block.sourceAstType === 'heading')
    expect(heading).toBeDefined()
    const materialized = materializeTranslatedMarkdown(
      markdown,
      blocks,
      new Map(heading ? [[heading.ordinal, '# Current title']] : []),
    )

    expect(materialized).toContain('# Current title')
    expect(materialized).toContain('保留 `ROS2_Control`')
    expect(materialized).toContain("const identity = 'ROS2_Control'")
  })

  it('validates the old source, old translation, and new source patch contract', () => {
    expect(
      createTargetedPatchContext({
        newSource: '新的正文。',
        oldSource: '旧的正文。',
        oldTranslation: 'Old body.',
      }),
    ).toEqual({
      newSource: '新的正文。',
      oldSource: '旧的正文。',
      oldTranslation: 'Old body.',
    })
  })
})
