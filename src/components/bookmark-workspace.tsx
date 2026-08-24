'use client'

import { Download, Plus, Search, Trash2, Upload } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'

const bookmarkSchema = z.object({ id: z.uuid(), name: z.string().min(1), url: z.url() }).strict()
const bookmarkListSchema = z.array(bookmarkSchema).max(100)
type Bookmark = z.infer<typeof bookmarkSchema>

type Labels = Readonly<{
  add: string
  export: string
  import: string
  name: string
  remove: string
  search: string
  searchPlaceholder: string
  storageNote: string
  url: string
}>

const storageKey = 'tungchiahui-start-bookmarks-v1'

export function BookmarkWorkspace({ labels }: Readonly<{ labels: Labels }>) {
  const [bookmarks, setBookmarks] = useState<readonly Bookmark[]>([])
  const [ready, setReady] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const parsed = bookmarkListSchema.safeParse(
        JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown,
      )
      if (parsed.success) setBookmarks(parsed.data)
    } catch {
      localStorage.removeItem(storageKey)
    } finally {
      setReady(true)
    }
  }, [])

  function persist(next: readonly Bookmark[]) {
    setBookmarks(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const parsed = bookmarkSchema.safeParse({
      id: crypto.randomUUID(),
      name: form.get('name'),
      url: form.get('url'),
    })
    if (!parsed.success) return
    persist([...bookmarks, parsed.data])
    event.currentTarget.reset()
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = new FormData(event.currentTarget).get('query')
    if (typeof query === 'string' && query.trim()) {
      window.location.assign(`https://www.google.com/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  function exportBookmarks() {
    const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = 'bookmarks.json'
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  async function importBookmarks(file: File | undefined) {
    if (!file) return
    try {
      const parsed = bookmarkListSchema.safeParse(JSON.parse(await file.text()) as unknown)
      if (parsed.success) persist(parsed.data)
    } catch {
      // Invalid bookmark exports are ignored without mutating the current local collection.
    }
  }

  return (
    <div className="mt-8 grid gap-6">
      <form className="flex gap-2" onSubmit={search}>
        <input
          aria-label={labels.searchPlaceholder}
          className="min-w-0 flex-1 rounded-md border bg-card px-3 py-2"
          name="query"
          placeholder={labels.searchPlaceholder}
        />
        <Button type="submit">
          <Search aria-hidden="true" size={16} /> {labels.search}
        </Button>
      </form>
      <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" onSubmit={add}>
        <input
          className="rounded-md border px-3 py-2"
          name="name"
          placeholder={labels.name}
          required
        />
        <input
          className="rounded-md border px-3 py-2"
          name="url"
          placeholder={labels.url}
          required
          type="url"
        />
        <Button className="sm:col-span-2" disabled={!ready} type="submit">
          <Plus aria-hidden="true" size={16} /> {labels.add}
        </Button>
      </form>
      <ul className="grid gap-2">
        {bookmarks.map((bookmark) => (
          <li
            className="flex items-center justify-between rounded-lg border bg-card p-3"
            key={bookmark.id}
          >
            <a
              className="font-medium text-primary hover:underline"
              href={bookmark.url}
              rel="noreferrer"
              target="_blank"
            >
              {bookmark.name}
            </a>
            <Button
              aria-label={`${labels.remove}: ${bookmark.name}`}
              className="size-8 bg-transparent px-0 text-foreground"
              onClick={() => persist(bookmarks.filter((item) => item.id !== bookmark.id))}
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={exportBookmarks} type="button">
          <Download aria-hidden="true" size={16} /> {labels.export}
        </Button>
        <Button onClick={() => importInput.current?.click()} type="button">
          <Upload aria-hidden="true" size={16} /> {labels.import}
        </Button>
        <input
          accept="application/json"
          className="sr-only"
          onChange={(event) => void importBookmarks(event.target.files?.[0])}
          ref={importInput}
          type="file"
        />
      </div>
      <p className="text-muted-foreground text-sm">{labels.storageNote}</p>
    </div>
  )
}
