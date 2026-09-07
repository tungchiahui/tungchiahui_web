'use client'

import { BookOpen, ListTree, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { MarkdownHeading } from '@/web/markdown'

type NavigationItem = Readonly<{
  chapter?: string
  current: boolean
  depth: number
  href: string
  title: string
}>

type ReaderLabels = Readonly<{
  close: string
  codeCopied: string
  copyCode: string
  documentNavigation: string
  imagePreview: string
  tableOfContents: string
}>

function Toc({
  headings,
  label,
  onNavigate,
}: Readonly<{
  headings: readonly MarkdownHeading[]
  label: string
  onNavigate?: () => void
}>) {
  return (
    <nav aria-label={label} data-reader-toc>
      <h2 className="font-semibold">{label}</h2>
      <ol className="mt-3 grid gap-1 text-sm">
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingInlineStart: `${heading.level * 0.75}rem` }}>
            <a
              aria-label={`${heading.number}. ${heading.text}`}
              className="flex gap-2 rounded-md px-1.5 py-1 hover:bg-background hover:text-primary"
              data-toc-link={heading.id}
              href={`#${heading.id}`}
              {...(onNavigate ? { onClick: onNavigate } : {})}
            >
              <span className="min-w-fit font-medium text-muted-foreground tabular-nums">
                {heading.number}.
              </span>
              <span>{heading.text}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function DocumentNavigation({
  items,
  label,
  onNavigate,
}: Readonly<{
  items: readonly NavigationItem[]
  label: string
  onNavigate?: () => void
}>) {
  return (
    <nav aria-label={label} data-wiki-document-navigation>
      <h2 className="font-semibold">{label}</h2>
      <ol className="mt-3 grid gap-1 text-sm">
        {items.map((item) => (
          <li key={item.href} style={{ paddingInlineStart: `${item.depth * 0.75}rem` }}>
            <Link
              aria-current={item.current ? 'page' : undefined}
              className={item.current ? 'font-semibold text-primary' : 'hover:text-primary'}
              href={item.href}
              {...(onNavigate ? { onClick: onNavigate } : {})}
            >
              {item.chapter ? `${item.chapter} ` : ''}
              {item.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function ArticleReader({
  documentNavigation,
  headings,
  html,
  labels,
}: Readonly<{
  documentNavigation: readonly NavigationItem[]
  headings: readonly MarkdownHeading[]
  html: string
  labels: ReaderLabels
}>) {
  const contentRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [drawer, setDrawer] = useState<'document' | 'toc' | undefined>()
  const [image, setImage] = useState<Readonly<{ alt: string; src: string }> | undefined>()
  const hasToc = headings.length > 1

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const cleanup: Array<() => void> = []
    for (const pre of content.querySelectorAll('pre')) {
      const wrapper = document.createElement('div')
      wrapper.className = 'code-block'
      pre.before(wrapper)
      wrapper.append(pre)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-copy-button'
      button.textContent = labels.copyCode
      const copy = async () => {
        const source = pre.textContent ?? ''
        try {
          await navigator.clipboard.writeText(source)
        } catch {
          const textarea = document.createElement('textarea')
          textarea.value = source
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.append(textarea)
          textarea.select()
          document.execCommand('copy')
          textarea.remove()
        }
        button.textContent = labels.codeCopied
        window.setTimeout(() => {
          button.textContent = labels.copyCode
        }, 1_500)
      }
      button.addEventListener('click', copy)
      wrapper.prepend(button)
      cleanup.push(() => {
        button.removeEventListener('click', copy)
        wrapper.replaceWith(pre)
      })
    }
    for (const candidate of content.querySelectorAll('img')) {
      const source = candidate.getAttribute('src')
      if (!source) continue
      candidate.tabIndex = 0
      const open = () => setImage({ alt: candidate.alt, src: source })
      const onKeyDown = (event: Event) => {
        if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          open()
        }
      }
      candidate.addEventListener('click', open)
      candidate.addEventListener('keydown', onKeyDown)
      cleanup.push(() => {
        candidate.removeEventListener('click', open)
        candidate.removeEventListener('keydown', onKeyDown)
      })
    }
    const navigateInternal = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      const href = anchor?.getAttribute('href')
      if (
        !anchor ||
        !href?.startsWith('/') ||
        href.startsWith('/docs/') ||
        anchor.hasAttribute('download')
      ) {
        return
      }
      event.preventDefault()
      router.push(href)
    }
    content.addEventListener('click', navigateInternal)
    cleanup.push(() => content.removeEventListener('click', navigateInternal))
    return () => {
      for (const dispose of cleanup) dispose()
    }
  }, [labels.codeCopied, labels.copyCode, router])

  useEffect(() => {
    const update = () => {
      const root = document.documentElement
      const maximum = root.scrollHeight - window.innerHeight
      root.style.setProperty(
        '--reading-progress',
        `${maximum <= 0 ? 100 : Math.min(100, (window.scrollY / maximum) * 100)}%`,
      )
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    const content = contentRef.current
    if (!content || headings.length === 0) return
    const update = () => {
      const active = headings
        .map((heading) => document.getElementById(heading.id))
        .filter(
          (heading): heading is HTMLElement =>
            heading instanceof HTMLElement && content.contains(heading),
        )
        .findLast((heading) => heading.getBoundingClientRect().top <= 140)
      for (const link of document.querySelectorAll<HTMLElement>('[data-toc-link]')) {
        if (link.dataset.tocLink === active?.id) link.setAttribute('aria-current', 'location')
        else link.removeAttribute('aria-current')
      }
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [headings])

  useEffect(() => {
    if (!drawer) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(undefined)
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [drawer])

  return (
    <>
      <div aria-hidden="true" className="reading-progress" data-reading-progress />
      {(documentNavigation.length > 0 || hasToc) && (
        <div className="article-mobile-tools lg:hidden">
          {documentNavigation.length > 0 ? (
            <button
              aria-label={labels.documentNavigation}
              onClick={() => setDrawer('document')}
              title={labels.documentNavigation}
              type="button"
            >
              <BookOpen aria-hidden size={20} strokeWidth={1.8} />
            </button>
          ) : null}
          {hasToc ? (
            <button
              aria-label={labels.tableOfContents}
              onClick={() => setDrawer('toc')}
              title={labels.tableOfContents}
              type="button"
            >
              <ListTree aria-hidden size={20} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>
      )}
      <div className="article-reader-grid">
        {documentNavigation.length > 0 ? (
          <aside className="article-reader-sidebar hidden lg:block">
            <DocumentNavigation items={documentNavigation} label={labels.documentNavigation} />
          </aside>
        ) : null}
        <div
          className="prose-site min-w-0"
          ref={contentRef}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown is sanitized before this client boundary.
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {hasToc ? (
          <aside className="article-reader-toc hidden lg:block">
            <Toc headings={headings} label={labels.tableOfContents} />
          </aside>
        ) : null}
      </div>
      {drawer ? (
        <div className="article-drawer-backdrop" data-reader-drawer>
          <button
            aria-label={labels.close}
            className="absolute inset-0"
            onClick={() => setDrawer(undefined)}
            type="button"
          />
          <aside className="article-drawer-panel">
            <div aria-hidden className="article-drawer-handle" />
            <button
              aria-label={labels.close}
              className="article-drawer-close"
              onClick={() => setDrawer(undefined)}
              type="button"
            >
              <X aria-hidden size={18} />
            </button>
            {drawer === 'document' ? (
              <DocumentNavigation
                items={documentNavigation}
                label={labels.documentNavigation}
                onNavigate={() => setDrawer(undefined)}
              />
            ) : (
              <Toc
                headings={headings}
                label={labels.tableOfContents}
                onNavigate={() => setDrawer(undefined)}
              />
            )}
          </aside>
        </div>
      ) : null}
      {image ? (
        <div
          aria-label={labels.imagePreview}
          aria-modal="true"
          className="image-preview"
          role="dialog"
        >
          <button
            aria-label={labels.close}
            className="absolute inset-0 z-10 grid place-items-center border-0 bg-transparent p-4"
            onClick={() => setImage(undefined)}
            type="button"
          >
            {/* biome-ignore lint/performance/noImgElement: the zoom overlay reuses the already validated and loaded Markdown image URL. */}
            <img
              alt={image.alt}
              className="max-h-[88vh] max-w-[92vw] object-contain"
              src={image.src}
            />
          </button>
          <button
            className="absolute top-4 right-4 z-20 rounded-lg bg-background px-4 py-2"
            onClick={() => setImage(undefined)}
            type="button"
          >
            {labels.close}
          </button>
        </div>
      ) : null}
    </>
  )
}
