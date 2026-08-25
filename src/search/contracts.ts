import { z } from 'zod'

import { contentTypeSchema, localeSchema } from '../domain/persistence'

export const searchMatchedContextValues = ['title', 'heading', 'body', 'metadata'] as const
export const searchMatchedContextSchema = z.enum(searchMatchedContextValues)

export const searchQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((query) => query.replaceAll(/\s+/gu, ' '))

export const searchRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    locale: localeSchema,
    query: searchQuerySchema,
  })
  .strict()

export const searchResultSchema = z
  .object({
    contentType: contentTypeSchema,
    locale: localeSchema,
    matchedContext: searchMatchedContextSchema,
    route: z.string().startsWith('/').min(2),
    score: z.number().finite().nonnegative(),
    snippet: z.string().max(500),
    title: z.string().min(1),
  })
  .strict()

export const searchResponseSchema = z
  .object({
    locale: localeSchema,
    query: searchQuerySchema,
    results: z.array(searchResultSchema),
  })
  .strict()

export type SearchRequest = Readonly<z.infer<typeof searchRequestSchema>>
export type SearchResult = Readonly<z.infer<typeof searchResultSchema>>
export type SearchResponse = Readonly<z.infer<typeof searchResponseSchema>>
