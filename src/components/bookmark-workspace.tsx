'use client'

import {
  Download,
  History,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { type StartBackground, startBackgroundListSchema } from '@/start/backgrounds'

const bookmarkSchema = z
  .object({
    color: z.string().max(24).default('#308eda'),
    desc: z.string().max(160).default(''),
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    url: z.url(),
  })
  .strict()
const sectionSchema = z
  .object({ items: z.array(bookmarkSchema).max(100), title: z.string().min(1).max(80) })
  .strict()
const sectionListSchema = z.array(sectionSchema).max(24)
const historySchema = z
  .array(
    z.object({ engine: z.string(), text: z.string().min(1), timestamp: z.number().int() }).strict(),
  )
  .max(20)
type BookmarkSection = z.infer<typeof sectionSchema>
type HistoryEntry = z.infer<typeof historySchema>[number]
type EngineId = 'baidu' | 'google' | 'bing'

const engines = [
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=' },
] as const satisfies readonly { id: EngineId; name: string; url: string }[]
const fallbackBackground: StartBackground = {
  url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=86',
  title: '山谷',
  copyright: 'Unsplash',
}
const fallbackBackgrounds: readonly StartBackground[] = [
  fallbackBackground,
  {
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2400&q=86',
    title: '湖畔',
    copyright: 'Unsplash',
  },
] as const
const defaultSections: readonly BookmarkSection[] = [
  {
    title: '日常工具',
    items: [
      {
        id: 'tool-gmail',
        name: 'Gmail',
        desc: '邮件收件箱',
        url: 'https://mail.google.com',
        color: '#ef5b4d',
      },
      {
        id: 'tool-github',
        name: 'GitHub',
        desc: '代码与项目',
        url: 'https://github.com',
        color: '#6f66d8',
      },
      {
        id: 'tool-notion',
        name: 'Notion',
        desc: '笔记与资料',
        url: 'https://notion.so',
        color: '#2f3437',
      },
      {
        id: 'tool-chatgpt',
        name: 'ChatGPT',
        desc: 'AI 助手',
        url: 'https://chat.openai.com',
        color: '#10a37f',
      },
    ],
  },
  {
    title: '开发资源',
    items: [
      {
        id: 'dev-mdn',
        name: 'MDN',
        desc: 'Web 文档',
        url: 'https://developer.mozilla.org',
        color: '#2f80ed',
      },
      {
        id: 'dev-stack',
        name: 'Stack Overflow',
        desc: '技术问答',
        url: 'https://stackoverflow.com',
        color: '#f48225',
      },
      {
        id: 'dev-caniuse',
        name: 'Can I Use',
        desc: '兼容性查询',
        url: 'https://caniuse.com',
        color: '#7bbf47',
      },
    ],
  },
  {
    title: '阅读灵感',
    items: [
      {
        id: 'read-hn',
        name: 'Hacker News',
        desc: '技术热榜',
        url: 'https://news.ycombinator.com',
        color: '#ff6600',
      },
      {
        id: 'read-v2ex',
        name: 'V2EX',
        desc: '创意社区',
        url: 'https://www.v2ex.com',
        color: '#308eda',
      },
      {
        id: 'read-zhihu',
        name: '知乎',
        desc: '知识问答',
        url: 'https://www.zhihu.com',
        color: '#0084ff',
      },
    ],
  },
]
const keys = {
  background: 'start-page-background',
  bookmarks: 'start-page-bookmarks',
  engine: 'start-page-engine',
  history: 'start-page-history',
  view: 'start-page-view-mode',
} as const

export function BookmarkWorkspace() {
  const t = useTranslations('Web.start')
  const locale = useLocale()
  const [sections, setSections] = useState<readonly BookmarkSection[]>(defaultSections)
  const [history, setHistory] = useState<readonly HistoryEntry[]>([])
  const [engineIndex, setEngineIndex] = useState(0)
  const [backgroundIndex, setBackgroundIndex] = useState(0)
  const [backgrounds, setBackgrounds] = useState<readonly StartBackground[]>(fallbackBackgrounds)
  const [detailed, setDetailed] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<readonly string[]>([])
  const [showOptions, setShowOptions] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [editing, setEditing] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const currentEngine = engines[engineIndex] ?? engines[0]

  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    try {
      const storedSections = sectionListSchema.safeParse(
        JSON.parse(localStorage.getItem(keys.bookmarks) ?? 'null') as unknown,
      )
      if (storedSections.success) setSections(storedSections.data)
      const storedHistory = historySchema.safeParse(
        JSON.parse(localStorage.getItem(keys.history) ?? '[]') as unknown,
      )
      if (storedHistory.success) setHistory(storedHistory.data)
      const engine = engines.findIndex((item) => item.id === localStorage.getItem(keys.engine))
      if (engine >= 0) setEngineIndex(engine)
      setDetailed(localStorage.getItem(keys.view) === 'detailed')
      const background = Number(localStorage.getItem(keys.background) ?? 0)
      if (Number.isInteger(background))
        setBackgroundIndex(Math.abs(background) % fallbackBackgrounds.length)
    } catch {
      // Invalid legacy browser state falls back to the validated default launchpad.
    }
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/start/backgrounds', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('backgrounds unavailable')
        return startBackgroundListSchema.parse(await response.json())
      })
      .then((next) => {
        setBackgrounds(next)
        setBackgroundIndex((current) => current % next.length)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || looksLikeUrl(trimmed)) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/search/suggestions?q=${encodeURIComponent(trimmed)}&engine=${currentEngine.id}`,
        { signal: controller.signal },
      )
        .then(async (response) =>
          response.ok
            ? z.object({ suggestions: z.array(z.string()).max(8) }).parse(await response.json())
                .suggestions
            : [],
        )
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [currentEngine.id, query])

  const saveSections = useCallback((next: readonly BookmarkSection[]) => {
    setSections(next)
    localStorage.setItem(keys.bookmarks, JSON.stringify(next))
  }, [])
  const saveHistory = useCallback((next: readonly HistoryEntry[]) => {
    const limited = next.slice(0, 20)
    setHistory(limited)
    localStorage.setItem(keys.history, JSON.stringify(limited))
  }, [])
  const options = useMemo(() => {
    const value = query.trim().toLowerCase()
    const combined = [
      ...suggestions.map((text) => ({ text, engine: currentEngine.name, timestamp: 0 })),
      ...history.filter((item) => !value || item.text.toLowerCase().includes(value)),
    ]
    return combined
      .filter(
        (item, index) =>
          combined.findIndex((other) => other.text.toLowerCase() === item.text.toLowerCase()) ===
          index,
      )
      .slice(0, 8)
  }, [currentEngine.name, history, query, suggestions])

  function executeSearch(text = query) {
    const value = text.trim()
    if (!value) return
    saveHistory([
      { text: value, engine: currentEngine.name, timestamp: Date.now() },
      ...history.filter((item) => item.text !== value),
    ])
    window.location.assign(
      looksLikeUrl(value)
        ? value.startsWith('http')
          ? value
          : `https://${value}`
        : `${currentEngine.url}${encodeURIComponent(value)}`,
    )
  }
  function cycleEngine() {
    const next = (engineIndex + 1) % engines.length
    setEngineIndex(next)
    localStorage.setItem(keys.engine, engines[next]?.id ?? 'baidu')
  }
  function cycleBackground() {
    const next = (backgroundIndex + 1) % backgrounds.length
    setBackgroundIndex(next)
    localStorage.setItem(keys.background, String(next))
  }
  function switchView(next: boolean) {
    setDetailed(next)
    if (!next) setEditing(false)
    localStorage.setItem(keys.view, next ? 'detailed' : 'simple')
  }
  function add(event: FormEvent<HTMLFormElement>, sectionIndex: number) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const parsed = bookmarkSchema.safeParse({
      color: '#308eda',
      desc: form.get('desc') ?? '',
      id: crypto.randomUUID(),
      name: form.get('name'),
      url: form.get('url'),
    })
    if (!parsed.success) return
    saveSections(
      sections.map((section, index) =>
        index === sectionIndex ? { ...section, items: [...section.items, parsed.data] } : section,
      ),
    )
    event.currentTarget.reset()
  }
  function exportBookmarks() {
    const blob = new Blob([JSON.stringify(sections, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = 'start-page-bookmarks.json'
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }
  async function importBookmarks(file: File | undefined) {
    if (!file) return
    try {
      const parsed = sectionListSchema.safeParse(JSON.parse(await file.text()) as unknown)
      if (parsed.success) saveSections(parsed.data)
    } catch {
      /* Keep current collection. */
    }
  }

  const greetingKey =
    now === null
      ? null
      : now.getHours() < 9
        ? 'greetingEarly'
        : now.getHours() < 12
          ? 'greetingMorning'
          : now.getHours() < 14
            ? 'greetingNoon'
            : now.getHours() < 18
              ? 'greetingAfternoon'
              : now.getHours() < 22
                ? 'greetingEvening'
                : 'greetingNight'
  const backgroundStyle = {
    '--start-photo': `url("${backgrounds[backgroundIndex]?.url ?? fallbackBackground.url}")`,
  } as CSSProperties

  return (
    <div
      className={`start-workspace ${detailed ? 'is-detailed' : 'is-simple'}`}
      style={backgroundStyle}
    >
      <div className="start-overlay" />
      <div className="start-content">
        <header className="start-toolbar">
          <div className="start-view-toggle">
            <button aria-pressed={!detailed} onClick={() => switchView(false)} type="button">
              <List size={15} /> {t('simple')}
            </button>
            <button aria-pressed={detailed} onClick={() => switchView(true)} type="button">
              <LayoutGrid size={15} /> {t('detailed')}
            </button>
          </div>
          <button aria-label={t('switchBackground')} onClick={cycleBackground} type="button">
            <ImageIcon size={17} />
          </button>
        </header>
        <section className="start-clock">
          <strong>
            {now?.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) ?? '--:--'}
          </strong>
          <span>{now?.toLocaleDateString(locale, { dateStyle: 'full' }) ?? ''}</span>
          <p>{greetingKey ? t(greetingKey) : ''}</p>
        </section>
        <form
          className="start-search"
          onSubmit={(event) => {
            event.preventDefault()
            executeSearch()
          }}
        >
          <button
            aria-label={t('switchEngine', { engine: currentEngine.name })}
            onClick={cycleEngine}
            type="button"
          >
            {currentEngine.name}
          </button>
          <input
            autoComplete="off"
            onBlur={() => window.setTimeout(() => setShowOptions(false), 150)}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              setShowOptions(true)
            }}
            onFocus={() => setShowOptions(true)}
            placeholder={t('searchPlaceholder')}
            value={query}
          />
          <Button aria-label={t('search')} type="submit">
            <Search size={18} />
          </Button>
          {showOptions && options.length ? (
            <div className="start-suggestions">
              {options.map((item) => (
                <button
                  key={`${item.text}-${item.engine}`}
                  onMouseDown={() => executeSearch(item.text)}
                  type="button"
                >
                  <History size={14} />
                  <span>{item.text}</span>
                  <small>{item.engine}</small>
                </button>
              ))}
            </div>
          ) : null}
        </form>
        {detailed ? (
          <section className="start-launchpad">
            <div className="start-section-head">
              <div>
                <span>LAUNCHPAD</span>
                <h1>{t('bookmarks')}</h1>
              </div>
              <div>
                <Button onClick={() => setEditing(!editing)} type="button">
                  {editing ? t('finishEdit') : t('edit')}
                </Button>
                <Button
                  aria-label={t('addSection')}
                  onClick={() => saveSections([...sections, { title: t('newSection'), items: [] }])}
                  type="button"
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>
            <div className="start-bookmark-sections">
              {sections.map((section, sectionIndex) => (
                <article key={section.title}>
                  {editing ? (
                    <input
                      aria-label={t('sectionName')}
                      onChange={(event) =>
                        saveSections(
                          sections.map((item, index) =>
                            index === sectionIndex
                              ? { ...item, title: event.currentTarget.value }
                              : item,
                          ),
                        )
                      }
                      value={section.title}
                    />
                  ) : (
                    <h2>{section.title}</h2>
                  )}
                  <div className="start-bookmark-grid">
                    {section.items.map((bookmark) => (
                      <div className="start-bookmark" key={bookmark.id}>
                        <a href={bookmark.url} rel="noreferrer">
                          <i style={{ background: bookmark.color }}>
                            {bookmark.name.slice(0, 1).toUpperCase()}
                          </i>
                          <span>
                            <strong>{bookmark.name}</strong>
                            <small>{bookmark.desc}</small>
                          </span>
                        </a>
                        {editing ? (
                          <button
                            aria-label={`${t('remove')}: ${bookmark.name}`}
                            onClick={() =>
                              saveSections(
                                sections.map((item, index) =>
                                  index === sectionIndex
                                    ? {
                                        ...item,
                                        items: item.items.filter(
                                          (entry) => entry.id !== bookmark.id,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                            type="button"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {editing ? (
                    <form className="start-add-form" onSubmit={(event) => add(event, sectionIndex)}>
                      <input name="name" placeholder={t('name')} required />
                      <input name="desc" placeholder={t('descriptionField')} />
                      <input name="url" placeholder={t('url')} required type="url" />
                      <Button type="submit">
                        <Plus size={15} />
                        {t('add')}
                      </Button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
            <footer className="start-data-actions">
              <Button onClick={exportBookmarks} type="button">
                <Download size={16} />
                {t('export')}
              </Button>
              <Button onClick={() => importInput.current?.click()} type="button">
                <Upload size={16} />
                {t('import')}
              </Button>
              <Button onClick={() => saveSections(defaultSections)} type="button">
                <RotateCcw size={16} />
                {t('reset')}
              </Button>
              <input
                accept="application/json"
                className="sr-only"
                onChange={(event) => void importBookmarks(event.target.files?.[0])}
                ref={importInput}
                type="file"
              />
            </footer>
          </section>
        ) : null}
        <p className="start-wallpaper-credit">
          {t('wallpaperSource', {
            title: backgrounds[backgroundIndex]?.title ?? fallbackBackground.title,
          })}
          <span>{backgrounds[backgroundIndex]?.copyright ?? fallbackBackground.copyright}</span>
        </p>
      </div>
    </div>
  )
}

function looksLikeUrl(value: string) {
  return /^(https?:\/\/|[a-z0-9-]+\.[a-z]{2,})/i.test(value)
}
