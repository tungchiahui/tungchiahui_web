import { describe, expect, it, vi } from 'vitest'

import { localizeContentMarkdown } from '@/i18n/content-markdown'
import { locales } from '@/i18n/locales'
import {
  isSafeTranslationCandidate,
  segmentMarkdownForTranslation,
} from '@/translation/segmentation'
import { renderArticleMarkdown } from '@/web/article-markdown'
import { renderMarkdown } from '@/web/markdown'

const formula = String.raw`a_{\text{raw}}\frac{\|\texttt{gravity}\|}{\texttt{acc\_norm}}`
const delimiters = [
  `$${formula}$`,
  `$$\n${formula}\n$$`,
  String.raw`\(${formula}\)`,
  `\\[\n${formula}\n\\]`,
]

describe('shared Markdown math', () => {
  it.each(['zh-hk', 'zh-tw'] as const)(
    'recovers formulas from older damaged %s materializations',
    async (locale) => {
      const rawMarkdown = `软件项目\n\n${delimiters.join('\n\n')}`
      const rendered = await renderArticleMarkdown(
        {
          rawMarkdown,
          localizedMarkdown: '軟體專案\n\n[r^2=x^2+y^2+z^2]',
        },
        locale,
      )
      expect(rendered.html.match(/class="katex"/g)).toHaveLength(4)
      expect(rendered.html).toContain(locale === 'zh-tw' ? '軟體專案' : '軟件項目')
    },
    20_000,
  )

  it('keeps the reviewed English materialization when rendering formulas', async () => {
    const rendered = await renderArticleMarkdown(
      {
        rawMarkdown: '原文 $x^2$。',
        localizedMarkdown: 'Reviewed English $x^2$.',
      },
      'en-us',
    )
    expect(rendered.html).toContain('Reviewed English')
    expect(rendered.html).not.toContain('原文')
    expect(rendered.html).toContain('class="katex"')
  })
  it.each(locales)(
    'renders all authoring delimiters as HTML and accessible MathML in %s',
    async (locale) => {
      const rendered = await renderMarkdown(delimiters.join('\n\n'), locale)
      expect(rendered.html.match(/class="katex"/g)).toHaveLength(4)
      expect(rendered.html.match(/class="katex-display"/g)).toHaveLength(2)
      expect(rendered.html.match(/<math[ >]/g)).toHaveLength(4)
      expect(rendered.html).toContain('encoding="application/x-tex"')
      expect(rendered.html).toContain('acc\\_norm')
      expect(rendered.html).not.toContain('katex-error')
      expect(rendered.html).not.toContain('language-math')
    },
    20_000,
  )

  it('keeps math in lists/tables/headings and stable readable heading labels', async () => {
    const rendered = await renderMarkdown(String.raw`# Energy $E=mc^2$

- Radius \(r^2=x^2+y^2+z^2\).

| Name | Formula |
| --- | --- |
| Ratio | $\frac{1}{2}$ |`)
    expect(rendered.html.match(/class="katex"/g)).toHaveLength(3)
    expect(rendered.headings[0]).toMatchObject({ id: 'energy-e-mc-2', text: 'Energy E=mc^2' })
  })

  it('leaves code, escaped dollars, escaped backslashes, incomplete delimiters and link destinations literal', async () => {
    const rendered = await renderMarkdown(
      String.raw`Keep \$5, \\(literal\\), \(unfinished and \[unfinished.

\`$x$ \(y\)\`

\`\`\`text
$$z$$ \[w\]
\`\`\`

[link](https://example.com/$x$)`.replaceAll('\\`', '`'),
    )
    expect(rendered.html).not.toContain('class="katex"')
    expect(rendered.html).toContain('href="https://example.com/$x$"')
    expect(rendered.html).toContain('$5')
  })

  it('preserves TeX bytes during deterministic regional conversion', () => {
    const source = String.raw`软件项目 $\text{软件项目}$ 与 \(\text{软件项目}\)。

\[
\text{软件项目}
\]

$$
\text{软件项目}
$$`
    const converted = localizeContentMarkdown(source, 'zh-tw')
    expect(converted).toContain('軟體專案')
    expect(converted.match(/软件项目/g)).toHaveLength(4)
    expect(localizeContentMarkdown(converted, 'zh-tw')).toBe(converted)
  })

  it('parses multiline matrix/align TeX in containers with CRLF and preserves source offsets', async () => {
    const source = String.raw`> \[
> \begin{aligned}
> a &= \frac{1}{2} \\
> b &= \begin{pmatrix}1 & 0 \\ 0 & 1\end{pmatrix}
> \end{aligned}
> \]`.replaceAll('\n', '\r\n')
    const rendered = await renderMarkdown(source)
    expect(rendered.html).toContain('class="katex-display"')
    expect(rendered.html).not.toContain('katex-error')
    const block = segmentMarkdownForTranslation(source)[0]
    expect(block?.sourceText).toBe(source)
    expect(block?.protectedValues[0]).toContain('inlineMath:')
    expect(isSafeTranslationCandidate(block, source.replace('1 & 0', '2 & 0'))).toBe(false)
  })

  it('protects inline math and excludes standalone formulas from paid translation', () => {
    const source = String.raw`半径 $r^2$ 与 \(x_1\)。

\[
r^2=x^2+y^2+z^2
\]

$$
g=-\frac{a}{\|a\|}G
$$`
    const blocks = segmentMarkdownForTranslation(source)
    expect(blocks.map((block) => block.isTranslatable)).toEqual([true, false, false])
    const paragraph = blocks[0]
    expect(paragraph?.protectedValues).toEqual(['inlineMath:r^2', 'inlineMath:x_1'])
    expect(isSafeTranslationCandidate(paragraph, String.raw`Radius $r^2$ and \(x_1\).`)).toBe(true)
    expect(isSafeTranslationCandidate(paragraph, String.raw`Radius $r^3$ and \(x_1\).`)).toBe(false)
    const moved = segmentMarkdownForTranslation(`New paragraph.\n\n${source}`)
    expect(moved[1]?.contextFingerprint).toBe(paragraph?.contextFingerprint)
    expect(moved[1]?.sourceHash).toBe(paragraph?.sourceHash)
  })

  it('renders malformed TeX as escaped source, emits only counts and keeps the article readable', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const rendered = await renderMarkdown(String.raw`$\frac{<script>alert(1)</script>}$

Still readable.`)
      expect(rendered.html).toContain('katex-error')
      expect(rendered.html).toContain('Still readable.')
      expect(rendered.html).not.toContain('<script>')
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('markdown_math_render_failed'))
      expect(warning.mock.calls.flat().join('')).not.toContain('script')
    } finally {
      warning.mockRestore()
    }
  })

  it('rejects trusted HTML/URL commands and strips raw HTML without loosening sanitization', async () => {
    const rendered = await renderMarkdown(String.raw`<img src=x onerror=alert(1)>

$\href{javascript:alert(1)}{click}$

$\htmlClass{injected}{x}$`)
    expect(rendered.html).not.toContain('href="javascript:')
    expect(rendered.html).not.toContain('class="injected"')
    expect(rendered.html).not.toContain('onerror=')
  })

  it('bounds recursive macro expansion and keeps definitions isolated between renders', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const recursive = await renderMarkdown(String.raw`$\def\loop{\loop}\loop$`)
      expect(recursive.html).toContain('katex-error')
      await renderMarkdown(String.raw`$\gdef\privateFormula{x}\privateFormula$`)
      const otherArticle = await renderMarkdown(String.raw`$\privateFormula$`)
      expect(otherArticle.html).toContain('\\privateFormula')
      expect(warning).toHaveBeenCalled()
    } finally {
      warning.mockRestore()
    }
  })
})
