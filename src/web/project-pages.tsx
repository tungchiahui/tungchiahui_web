import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { localizeContentText } from '@/i18n/content'
import { orderedProjects, projectMetadata } from '@/projects/catalog'
import type { PublicDocument } from '@/server/public-content'
import { documentDate, documentSummary } from './content-compatibility'
import { type PublicRouteContext, withLocalePrefix } from './routes'

export async function ProjectEntries({
  context,
  documents,
  compact = false,
}: Readonly<{
  context: PublicRouteContext
  documents: readonly PublicDocument[]
  compact?: boolean
}>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web.portfolio' })
  return (
    <ul className={compact ? 'cv-projects' : 'project-grid'}>
      {documents.map((document) => {
        const meta = projectMetadata(document)
        const title = localizeContentText(document.title, context.locale)
        return (
          <li key={document.id}>
            <Link
              className={compact ? 'cv-project' : 'project-card'}
              href={withLocalePrefix(document.routePath, context)}
            >
              {meta.cover ? (
                <div className="project-cover">
                  {/* biome-ignore lint/performance/noImgElement: author-owned HTTPS project media is validated at ingestion. */}
                  <img alt="" src={meta.cover} loading="lazy" />
                </div>
              ) : null}
              <div className="project-card-copy">
                <div className="project-meta">
                  <span>{t(`status.${meta.status}`)}</span>
                  {documentDate(document) ? <time>{documentDate(document)}</time> : null}
                </div>
                <h3>{title}</h3>
                <p>{localizeContentText(documentSummary(document) ?? '', context.locale)}</p>
                {meta.tags.length > 0 ? (
                  <ul className="project-tags" aria-label={t('technologies')}>
                    {meta.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                ) : null}
                {!compact ? <span className="project-read">{t('viewProject')}</span> : null}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export async function ProjectsPage({
  context,
  documents,
}: Readonly<{ context: PublicRouteContext; documents: readonly PublicDocument[] }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web.portfolio' })
  return (
    <div className="projects-page">
      <header className="projects-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="projects-intro">{t('intro')}</p>
        </div>
        <Link className="project-cv-link" href={withLocalePrefix('/cv', context)}>
          {t('viewCv')}
        </Link>
      </header>
      {documents.length > 0 ? (
        <section aria-label={t('allProjects')}>
          {await ProjectEntries({ context, documents: orderedProjects(documents) })}
        </section>
      ) : (
        <section className="projects-empty">
          <h2>{t('emptyTitle')}</h2>
          <p>{t('emptyBody')}</p>
          <Link href={withLocalePrefix('/cv', context)}>{t('viewCv')} →</Link>
        </section>
      )}
    </div>
  )
}

export async function ProjectDetailFrame({
  context,
  document,
  children,
}: Readonly<{ context: PublicRouteContext; document: PublicDocument; children: ReactNode }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web.portfolio' })
  const meta = projectMetadata(document)
  return (
    <div className="project-detail">
      <nav className="project-breadcrumb" aria-label={t('navigation')}>
        <Link href={withLocalePrefix('/projects', context)}>{t('backProjects')}</Link>
        <Link href={withLocalePrefix('/cv', context)}>{t('viewCv')}</Link>
      </nav>
      {meta.cover ? (
        <div className="project-detail-cover">
          {/* biome-ignore lint/performance/noImgElement: author-owned HTTPS project media is validated at ingestion. */}
          <img alt={localizeContentText(document.title, context.locale)} src={meta.cover} />
        </div>
      ) : null}
      <div className="project-detail-meta">
        <span>{t(`status.${meta.status}`)}</span>
        <ul className="project-tags" aria-label={t('technologies')}>
          {meta.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
        <div className="project-resources">
          {(['code', 'demo', 'video'] as const).map((key) =>
            meta[key] ? (
              <a href={meta[key]} key={key} rel="noreferrer" target="_blank">
                {t(key)}
              </a>
            ) : null,
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
