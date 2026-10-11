import { describe, expect, it, vi } from 'vitest'

import { createDeepSeekTranslationProvider } from '../../src/translation/deepseek'
import { createTranslationTextTemplate } from '../../src/translation/segmentation'

const request = {
  context: null,
  maxOutputTokens: 256,
  requestId: '00000000-0000-4000-8000-000000000001',
  sourceLocale: 'zh-cn' as const,
  sourceText: '# 机器人',
  targetLocale: 'en-us' as const,
}
const apiKey = 'test-provider-key-not-a-production-secret'

function completion(texts: readonly string[]) {
  return Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ texts }) } }],
    usage: { prompt_tokens: 100, completion_tokens: 10 },
  })
}

describe('DeepSeek translation boundary', () => {
  it('preserves English-only and protected-only blocks without paid HTTP calls', async () => {
    const requestFetch = vi.fn<typeof fetch>()
    const provider = createDeepSeekTranslationProvider({ apiKey, fetch: requestFetch })
    const english = { ...request, sourceText: '**Navigation** with `ROS2_Control`' }
    expect(provider.estimate(english).maximumCostUsd).toBe(0)
    await expect(provider.translate(english)).resolves.toMatchObject({
      translatedText: english.sourceText,
      usage: { costUsd: 0 },
    })
    expect(requestFetch).not.toHaveBeenCalled()
  })
  it('estimates without making requests and pins HTTPS, model, non-thinking mode and timeout', async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(completion(['Robot']))
    const provider = createDeepSeekTranslationProvider({ apiKey, fetch: requestFetch })
    expect(provider.estimate(request).maximumCostUsd).toBeGreaterThan(0)
    expect(requestFetch).not.toHaveBeenCalled()
    const result = await provider.translate(request)
    expect(result.translatedText).toBe('# Robot')
    expect(result.usage.costUsd).toBeLessThanOrEqual(provider.estimate(request).maximumCostUsd)
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 10 })
    const [url, options] = requestFetch.mock.calls[0] ?? []
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(options?.redirect).toBe('error')
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: 'deepseek-flash',
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    })
  })

  it.each([401, 429, 500])(
    'does not expose response bodies or blindly retry HTTP %s',
    async (status) => {
      const provider = createDeepSeekTranslationProvider({
        apiKey,
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(apiKey, { status })),
      })
      await expect(provider.translate(request)).rejects.toMatchObject({
        retryable: false,
        message: `DeepSeek returned HTTP ${status}; reserved budget retained`,
      })
    },
  )

  it.each([
    { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    {
      choices: [{ finish_reason: 'length', message: { content: '{"texts":["Robot"]}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    },
    {
      choices: [{ finish_reason: 'stop', message: { content: '{"texts":["Robot"]}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1_000_000 },
    },
  ])('rejects malformed, truncated and out-of-budget responses safely', async (body) => {
    const provider = createDeepSeekTranslationProvider({
      apiKey,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
    })
    await expect(provider.translate(request)).rejects.toMatchObject({
      retryable: false,
      message: expect.not.stringContaining(apiKey),
    })
  })

  it('leaves formulas, code, links and Markdown structure in a validated source template', () => {
    const source =
      '- 用 **机器人** 测试 `ROS2_Control`，公式 $x+y$。\n- 访问 [文档](https://example.test/a "原始标题")'
    const template = createTranslationTextTemplate(source)
    expect(template.texts).toHaveLength(7)
    const result = template.assemble([
      'Use ',
      'robots',
      ' to test ',
      ', with the formula ',
      '.',
      'Visit ',
      'documentation',
    ])
    // A structurally invalid replacement must never be accepted (a newline/list
    // injected by a provider is escaped and cannot introduce another AST node).
    expect(result).toContain('`ROS2_Control`')
    expect(result).toContain('$x+y$')
    expect(result).toContain('(https://example.test/a "原始标题")')
  })

  it('protects literal terms and escapes newly invented Markdown', () => {
    const template = createTranslationTextTemplate('运行 ROS2_Control 和 Next.js')
    const text = template.texts[0]
    expect(text).toContain('TRANSLATION_LITERAL_')
    const result = template.assemble([text?.replace('运行', 'Run').replace('和', 'and')])
    expect(result).toContain('ROS2_Control')
    expect(result).toContain('Next.js')
    expect(() => template.assemble(['Run renamed literals'])).toThrow('protected text markers')
    expect(createTranslationTextTemplate('机器人').assemble(['**Robot**'])).toBe(
      '\\*\\*Robot\\*\\*',
    )
  })

  it('keeps whitespace-only leaves in the original template', () => {
    const template = createTranslationTextTemplate('**中文** **测试**')
    expect(template.texts).toEqual(['中文', '测试'])
    expect(template.assemble(['Chinese', 'test'])).toBe('**Chinese** **test**')
  })
})
