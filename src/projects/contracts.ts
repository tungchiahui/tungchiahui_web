import { z } from 'zod'

const publicUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:', {
  message: 'Project resources must use HTTPS',
})

// Prose stays in Markdown so every view uses the same block translation memory.
// These optional fields only control presentation or identify external resources.
export const projectMetadataSchema = z
  .object({
    cover: publicUrlSchema.optional(),
    featured: z.boolean().default(false),
    order: z.number().int().min(0).max(10_000).default(100),
    status: z.enum(['completed', 'ongoing', 'archived']).default('completed'),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    code: publicUrlSchema.optional(),
    demo: publicUrlSchema.optional(),
    video: publicUrlSchema.optional(),
  })
  .strict()

export type ProjectMetadata = Readonly<z.infer<typeof projectMetadataSchema>>
