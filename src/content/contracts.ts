import { z } from 'zod'

import { contentTypeSchema, sourceCommitSchema } from '../domain/persistence'

export const contentSourcePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      /^content\/posts\/[^/]+\.md$/.test(path) ||
      /^content\/wiki\/[^/]+\/(?:[^/]+\/)*[^/]+\.md$/.test(path),
    'Expected a canonical Blog or Wiki Markdown path',
  )

export const contentSourceFileSchema = z.object({
  path: contentSourcePathSchema,
  contents: z.string().min(1),
})

export const contentSnapshotSchema = z.object({
  sourceCommit: sourceCommitSchema,
  files: z.array(contentSourceFileSchema),
})

export const preparedContentDocumentSchema = z.object({
  contentType: contentTypeSchema,
  sourcePath: contentSourcePathSchema,
  sourceCommit: sourceCommitSchema,
  title: z.string().trim().min(1),
  rawFrontmatter: z.record(z.string(), z.json()),
  rawMarkdown: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  routePath: z.string().startsWith('/').min(2),
  sourceUpdatedAt: z.date().nullable(),
})

export type ContentSnapshot = z.infer<typeof contentSnapshotSchema>
export type PreparedContentDocument = z.infer<typeof preparedContentDocumentSchema>

export interface ReadonlyContentSource {
  fetchSnapshot(sourceCommit: string): Promise<ContentSnapshot>
}
