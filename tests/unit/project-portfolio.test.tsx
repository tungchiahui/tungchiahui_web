import { cleanup, render, screen } from '@testing-library/react'
import { createTranslator } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentSourcePathSchema } from '@/content/contracts'
import { prepareContentSnapshot } from '@/content/markdown'
import { developmentProjectFiles } from '@/database/project-seed'
import { messagesForLocale } from '@/i18n/messages'
import { featuredProjects, orderedProjects } from '@/projects/catalog'
import { projectMetadataSchema } from '@/projects/contracts'
import { materializeSearchProjection } from '@/search/materialization'
import type { PublicDocument } from '@/server/public-content'
import { documentTranslationFields } from '@/translation/document-fields'
import {
  isSafeTranslationCandidate,
  segmentMarkdownForTranslation,
} from '@/translation/segmentation'
import { affectedPublicPaths } from '@/web/cache-policy'
import { documentSummary } from '@/web/content-compatibility'
import { ProjectDetailFrame, ProjectsPage } from '@/web/project-pages'
import { localeSwitchPath } from '@/web/routes'
import { pageMetadata, publicSitemap } from '@/web/seo'
import { CvInformationPage } from '@/web/special-information-pages'

vi.mock('next-intl/server', () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: Parameters<typeof messagesForLocale>[0]
    namespace: 'Web.information' | 'Web.portfolio'
  }) => createTranslator({ locale, messages: messagesForLocale(locale), namespace }),
}))
afterEach(cleanup)

const sourceCommit = 'a'.repeat(40)
const prepared = prepareContentSnapshot({ sourceCommit, files: developmentProjectFiles })
const projects: readonly PublicDocument[] = prepared.documents.map((document, index) => ({
  ...document,
  id: `10000000-0000-4000-8000-00000000000${index + 1}`,
  localizedMarkdown: null,
  contentLocaleState: 'source',
  fallbackSegmentCount: 0,
  pendingSegmentCount: 0,
  translatedSegmentCount: 0,
  translationMemoryHits: 0,
}))
const first = projects.find((project) => project.routePath === '/projects/robot-navigation-fixture')
if (!first) throw new Error('Missing project fixture')

describe('Maintainable multilingual project portfolio', () => {
  it('uses stable filenames and validates optional metadata without changing legacy routes', () => {
    expect(first.contentType).toBe('project')
    expect(contentSourcePathSchema.safeParse('content/projects/../private.md').success).toBe(false)
    expect(contentSourcePathSchema.safeParse('content/projects/nested/test.md').success).toBe(false)
    expect(projectMetadataSchema.parse({})).toMatchObject({
      featured: false,
      order: 100,
      tags: [],
      status: 'completed',
    })
    for (const value of [
      { featured: 'true' },
      { order: -1 },
      { cover: 'javascript:alert(1)' },
      { demo: 'http://example.com' },
      { status: 'invented' },
      { unknown: 'x' },
    ]) {
      expect(projectMetadataSchema.safeParse(value).success).toBe(false)
    }
    expect(() =>
      prepareContentSnapshot({
        sourceCommit,
        files: [
          { path: first.sourcePath, contents: '---\ntitle: Example\npath: /cv\n---\n\nBody' },
        ],
      }),
    ).toThrow('stable filename')
    expect(() =>
      prepareContentSnapshot({
        sourceCommit,
        files: [
          {
            path: 'content/posts/example.md',
            contents: '---\ntitle: Example\nproject: {}\n---\n\nBody',
          },
        ],
      }),
    ).toThrow('only allowed')
    expect(
      prepareContentSnapshot({ sourceCommit, files: developmentProjectFiles }).documents,
    ).toEqual(prepared.documents)
  })

  it('selects and orders the same records for the resume and index with a stable tie-break', () => {
    expect(orderedProjects([...projects].reverse()).map((project) => project.routePath)).toEqual([
      '/projects/robot-navigation-fixture',
      '/projects/control-system-fixture',
    ])
    expect(featuredProjects(projects).map((project) => project.routePath)).toEqual([
      first.routePath,
    ])
    const records = Array.from({ length: 6 }, (_, index) => ({
      ...first,
      routePath: `/projects/project-${index}`,
    }))
    expect(featuredProjects(records)).toHaveLength(4)
    expect(featuredProjects([])).toEqual([])
  })

  it('derives the shared summary from localized body prose and reuses unchanged translation blocks', () => {
    const document = {
      ...first,
      rawFrontmatter: { ...first.rawFrontmatter, description: '过期的中文摘要' },
      localizedMarkdown:
        '---\ntitle: Protected source\n---\n\nCurrent English summary.\n\n## Contribution\n\nDetails.',
    }
    expect(documentSummary(document)).toBe('Current English summary.')
    const blocks = segmentMarkdownForTranslation(first.rawMarkdown)
    const changed = segmentMarkdownForTranslation(
      first.rawMarkdown.replace('这是本地测试数据。', '这是更新后的本地测试数据。'),
    )
    expect(
      changed.filter((block) => blocks.some((old) => old.sourceHash === block.sourceHash)).length,
    ).toBe(blocks.length - 1)
    expect(
      documentTranslationFields(first.rawMarkdown, first.sourcePath).map((field) => field.field),
    ).toEqual(['title'])
    const code = blocks.find((block) => block.sourceText.includes('int main()'))
    expect(code?.isTranslatable).toBe(false)
    const protectedBlock = blocks.find((block) => block.sourceText.includes('ROS2_Control'))
    if (!protectedBlock) throw new Error('Missing protected project block')
    expect(
      isSafeTranslationCandidate(
        protectedBlock,
        protectedBlock.sourceText.replace('ROS2_Control', 'changed_identifier'),
      ),
    ).toBe(false)
  })

  it('invalidates resume, lists, moved routes and all locale variants on project updates', () => {
    const paths = affectedPublicPaths([
      {
        documentId: first.id,
        type: 'moved',
        routePath: first.routePath,
        previousRoutePath: '/projects/old-name',
        sourceHash: first.sourceHash,
      },
    ])
    for (const prefix of ['', '/zh-cn', '/zh-hk', '/zh-tw', '/en-us']) {
      for (const path of ['/cv', '/projects', '/projects/old-name', first.routePath])
        expect(paths).toContain(`${prefix}${path}`)
    }
    expect(localeSwitchPath(first.routePath, 'en-us')).toBe(
      '/en-us/projects/robot-navigation-fixture',
    )
    const base = new URL('https://www.tungchiahui.cn')
    expect(
      publicSitemap(base, projects).some(
        (entry) => entry.url === new URL('/en-us/projects/robot-navigation-fixture', base).href,
      ),
    ).toBe(true)
    expect(
      pageMetadata({
        base,
        path: first.routePath,
        locale: 'en-us',
        title: first.title,
        description: 'Example',
        siteName: 'Example',
      }).alternates?.canonical,
    ).toBe(new URL('/en-us/projects/robot-navigation-fixture', base).href)
  })

  it.each(['zh-cn', 'zh-hk', 'zh-tw', 'en-us'] as const)(
    'renders one shared resume, list, detail and empty state in %s',
    async (locale) => {
      const context = { locale, prefixed: true }
      const copy = messagesForLocale(locale).Web
      const cv = render(await CvInformationPage({ context, projects }))
      expect(screen.getByRole('heading', { name: copy.information.name })).toBeVisible()
      expect(screen.getByRole('button', { name: copy.portfolio.printResume })).toBeVisible()
      expect(cv.container.querySelector('.cv-project')?.getAttribute('href')).toBe(
        `/${locale}${first.routePath}`,
      )
      expect(cv.container.querySelectorAll('.cv-project')).toHaveLength(1)
      if (locale === 'en-us') expect(cv.container.textContent).not.toMatch(/[\p{Script=Han}]/u)
      cv.unmount()
      const index = render(await ProjectsPage({ context, documents: projects }))
      expect(screen.getByRole('heading', { name: copy.portfolio.title })).toBeVisible()
      expect(index.container.querySelectorAll('.project-card')).toHaveLength(2)
      index.unmount()
      const detail = render(
        await ProjectDetailFrame({ context, document: first, children: <p>Details</p> }),
      )
      expect(screen.getByRole('link', { name: copy.portfolio.backProjects })).toHaveAttribute(
        'href',
        `/${locale}/projects`,
      )
      expect(screen.getByRole('link', { name: copy.portfolio.code })).toHaveAttribute(
        'href',
        'https://github.com/tungchiahui',
      )
      detail.unmount()
      render(await ProjectsPage({ context, documents: [] }))
      expect(screen.getByRole('heading', { name: copy.portfolio.emptyTitle })).toBeVisible()
      const projection = materializeSearchProjection(
        {
          contentType: first.contentType,
          id: first.id,
          rawFrontmatter: first.rawFrontmatter,
          rawMarkdown: first.rawMarkdown,
          routePath: first.routePath,
          sourceHash: first.sourceHash,
          sourcePath: first.sourcePath,
          sourceUpdatedAt: first.sourceUpdatedAt,
          title: first.title,
          translations: {},
        },
        locale,
      )
      expect(projection.contentType).toBe('project')
      expect(projection.routePath).toBe(first.routePath)
      expect(projection.body).toContain('ROS2_Control')
    },
  )
})
