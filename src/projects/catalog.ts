import type { PublicDocument, PublicDocumentSummary } from '../server/public-content'
import { projectMetadataSchema } from './contracts'

export function projectMetadata(document: Pick<PublicDocument, 'rawFrontmatter'>) {
  return projectMetadataSchema.parse(document.rawFrontmatter.project ?? {})
}

export function orderedProjects<Document extends PublicDocumentSummary>(
  documents: readonly Document[],
) {
  return documents
    .filter((document) => document.contentType === 'project')
    .toSorted((a, b) => {
      const left = projectMetadata(a)
      const right = projectMetadata(b)
      return (
        Number(right.featured) - Number(left.featured) ||
        left.order - right.order ||
        (b.sourceUpdatedAt?.getTime() ?? 0) - (a.sourceUpdatedAt?.getTime() ?? 0) ||
        a.routePath.localeCompare(b.routePath, 'en')
      )
    })
}

export function featuredProjects<Document extends PublicDocumentSummary>(
  documents: readonly Document[],
) {
  return orderedProjects(documents)
    .filter((document) => projectMetadata(document).featured)
    .slice(0, 4)
}
