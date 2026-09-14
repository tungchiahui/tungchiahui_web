import { z } from 'zod'

export const bookmarkSchema = z
  .object({
    color: z.string().max(24).default('#308eda'),
    desc: z.string().max(160).default(''),
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    url: z.url(),
  })
  .strict()
export const startSectionSchema = z
  .object({ items: z.array(bookmarkSchema).max(100), title: z.string().min(1).max(80) })
  .strict()
export const startHistorySchema = z
  .array(
    z.object({ engine: z.string(), text: z.string().min(1), timestamp: z.number().int() }).strict(),
  )
  .max(20)
export const startPayloadSchema = z
  .object({
    version: z.literal(1),
    sections: z.array(startSectionSchema).max(24),
    history: startHistorySchema,
    engine: z.enum(['baidu', 'google', 'bing']),
    background: z.number().int().nonnegative(),
    detailed: z.boolean(),
  })
  .strict()
export type StartPayload = z.infer<typeof startPayloadSchema>

export const defaultStartPayload: StartPayload = {
  version: 1,
  sections: [
    {
      title: '日常工具',
      items: [
        {
          id: 'tool-gmail',
          name: 'Gmail',
          desc: '邮件收件箱',
          url: 'https://mail.google.com',
          color: '#ef5b4d',
        },
        {
          id: 'tool-github',
          name: 'GitHub',
          desc: '代码与项目',
          url: 'https://github.com',
          color: '#6f66d8',
        },
        {
          id: 'tool-notion',
          name: 'Notion',
          desc: '笔记与资料',
          url: 'https://notion.so',
          color: '#2f3437',
        },
        {
          id: 'tool-chatgpt',
          name: 'ChatGPT',
          desc: 'AI 助手',
          url: 'https://chat.openai.com',
          color: '#10a37f',
        },
      ],
    },
    {
      title: '开发资源',
      items: [
        {
          id: 'dev-mdn',
          name: 'MDN',
          desc: 'Web 文档',
          url: 'https://developer.mozilla.org',
          color: '#2f80ed',
        },
        {
          id: 'dev-stack',
          name: 'Stack Overflow',
          desc: '技术问答',
          url: 'https://stackoverflow.com',
          color: '#f48225',
        },
        {
          id: 'dev-caniuse',
          name: 'Can I Use',
          desc: '兼容性查询',
          url: 'https://caniuse.com',
          color: '#7bbf47',
        },
      ],
    },
    {
      title: '阅读灵感',
      items: [
        {
          id: 'read-hn',
          name: 'Hacker News',
          desc: '技术热榜',
          url: 'https://news.ycombinator.com',
          color: '#ff6600',
        },
        {
          id: 'read-v2ex',
          name: 'V2EX',
          desc: '创意社区',
          url: 'https://www.v2ex.com',
          color: '#308eda',
        },
        {
          id: 'read-zhihu',
          name: '知乎',
          desc: '知识问答',
          url: 'https://www.zhihu.com',
          color: '#0084ff',
        },
      ],
    },
  ],
  history: [],
  engine: 'baidu',
  background: 0,
  detailed: false,
}

export const startDataResponseSchema = z.object({
  authenticated: z.boolean(),
  account: z.object({ username: z.string(), role: z.enum(['owner', 'user']) }).nullable(),
  dataset: z.object({ payload: startPayloadSchema, revision: z.number().int().nonnegative() }),
})
