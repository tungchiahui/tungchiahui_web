import { z } from 'zod'

const glossarySchema = z
  .object({
    exceptions: z.array(
      z
        .object({
          source: z.string().min(1),
          targets: z.object({ 'zh-hk': z.string().min(1), 'zh-tw': z.string().min(1) }).strict(),
        })
        .strict(),
    ),
    protectedTerms: z.array(z.string().min(1)),
    revision: z.number().int().positive(),
    version: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
  })
  .strict()

export const contentGlossary = glossarySchema.parse({
  revision: 1,
  version: '2026-08-24.1',
  protectedTerms: [
    'TungChiaHui',
    'OpenCC',
    'Next.js',
    'PostgreSQL',
    'PGroonga',
    'GitHub',
    'TypeScript',
    'JavaScript',
    'React',
    'Tailwind CSS',
    'Wiki',
    'ROS 2',
    'ROS2',
    'C++',
    'Node.js',
    'pnpm',
  ],
  exceptions: [
    { source: '博客', targets: { 'zh-hk': '網誌', 'zh-tw': '部落格' } },
    { source: '软件', targets: { 'zh-hk': '軟件', 'zh-tw': '軟體' } },
    { source: '机器人', targets: { 'zh-hk': '機械人', 'zh-tw': '機器人' } },
    { source: '项目', targets: { 'zh-hk': '項目', 'zh-tw': '專案' } },
    { source: '源代码', targets: { 'zh-hk': '原始碼', 'zh-tw': '原始碼' } },
  ],
})
