import { z } from 'zod'

const bingImageSchema = z
  .object({
    copyright: z.string().max(500),
    title: z.string().max(160),
    url: z.string().min(1).max(1_000),
  })
  .passthrough()

export const bingArchiveSchema = z
  .object({ images: z.array(bingImageSchema).min(1).max(8) })
  .passthrough()

export const startBackgroundSchema = z
  .object({
    copyright: z.string().max(500),
    title: z.string().max(160),
    url: z.url(),
  })
  .strict()

export const startBackgroundListSchema = z.array(startBackgroundSchema).min(1).max(8)
export type StartBackground = z.infer<typeof startBackgroundSchema>

export function normalizeBingBackgrounds(input: unknown): StartBackground[] {
  return bingArchiveSchema.parse(input).images.map((image) => {
    const url = new URL(image.url, 'https://www.bing.com')
    if (url.protocol !== 'https:' || url.hostname !== 'www.bing.com' || url.pathname !== '/th') {
      throw new Error('Bing archive returned an unapproved image URL')
    }
    return startBackgroundSchema.parse({
      copyright: image.copyright,
      title: image.title,
      url: url.toString(),
    })
  })
}
