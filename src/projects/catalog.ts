import type { PublicDocument } from '../server/public-content'
import { projectMetadataSchema } from './contracts'

export function projectMetadata(document: PublicDocument) {
  return projectMetadataSchema.parse(document.rawFrontmatter.project ?? {})
}

export function orderedProjects(documents: readonly PublicDocument[]) {
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

export function featuredProjects(documents: readonly PublicDocument[]) {
  return orderedProjects(documents)
    .filter((document) => projectMetadata(document).featured)
    .slice(0, 4)
}
