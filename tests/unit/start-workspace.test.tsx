import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { BookmarkWorkspace } from '@/components/bookmark-workspace'
import { messagesForLocale } from '@/i18n/messages'
import { type StartPayload, startPayloadSchema } from '@/start/contracts'

const messages = messagesForLocale('en-us')
const copy = messages.Web.start
const initialPayload: StartPayload = {
  version: 1,
  sections: [{ title: 'Original', items: [] }],
  history: [],
  engine: 'baidu',
  background: 0,
  detailed: true,
}
const updateSchema = z.object({
  expectedRevision: z.number().int(),
  payload: startPayloadSchema,
})
type Update = z.infer<typeof updateSchema>
const snapshot = (payload = initialPayload, revision = 1) => ({
  authenticated: true,
  account: { username: 'owner', role: 'owner' },
  dataset: { payload, revision },
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function workspace(save: (update: Update) => Promise<Response>, payload = initialPayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('/backgrounds')) return Response.json([], { status: 503 })
      if (options?.method === 'PUT')
        return save(updateSchema.parse(JSON.parse(String(options.body)) as unknown))
      return Response.json(snapshot(payload))
    }),
  )
  render(
    <NextIntlClientProvider locale="en-us" messages={messages}>
      <BookmarkWorkspace homeHref="/" />
    </NextIntlClientProvider>,
  )
  await act(async () => {
    await Promise.resolve()
  })
}

const engineButton = (engine: string) =>
  screen.getByRole('button', { name: copy.switchEngine.replace('{engine}', engine) })
const advance = (milliseconds: number) => act(() => vi.advanceTimersByTimeAsync(milliseconds))

describe('Start editing and autosave', () => {
  it.each(['bookmarks', 'draft'] as const)(
    'imports a %s export without storing UI identities',
    async (format) => {
      const imported: StartPayload = {
        ...initialPayload,
        sections: [{ title: 'Imported', items: [] }],
        engine: 'bing',
        history: [{ text: 'previous query', engine: 'Bing', timestamp: 1 }],
      }
      const save = vi.fn(async (update: Update) => Response.json(snapshot(update.payload, 2)))
      await workspace(save)
      const file = new File([], 'export.json', { type: 'application/json' })
      Object.defineProperty(file, 'text', {
        value: async () => JSON.stringify(format === 'bookmarks' ? imported.sections : imported),
      })
      fireEvent.change(screen.getByLabelText(copy.import), { target: { files: [file] } })
      await act(async () => {
        await Promise.resolve()
      })
      await advance(650)
      expect(save).toHaveBeenCalledOnce()
      expect(save.mock.calls[0]?.[0].payload).toEqual(
        format === 'draft' ? imported : { ...initialPayload, sections: imported.sections },
      )
    },
  )

  it('serializes changes made during a save against the returned revision', async () => {
    const updates: Update[] = []
    const replies: ((response: Response) => void)[] = []
    await workspace((update) => {
      updates.push(update)
      return new Promise<Response>((resolve) => replies.push(resolve))
    })
    fireEvent.click(engineButton('Baidu'))
    await advance(650)
    expect(updates).toHaveLength(1)
    expect(updates[0]?.expectedRevision).toBe(1)
    expect(updates[0]?.payload.engine).toBe('google')
    fireEvent.click(engineButton('Google'))
    await advance(2000)
    expect(updates).toHaveLength(1)
    await act(async () => replies[0]?.(Response.json(snapshot(updates[0]?.payload, 2))))
    await advance(650)
    expect(updates).toHaveLength(2)
    expect(updates[1]?.expectedRevision).toBe(2)
    expect(updates[1]?.payload.engine).toBe('bing')
    await act(async () => replies[1]?.(Response.json(snapshot(updates[1]?.payload, 3))))
    await advance(3000)
    expect(updates).toHaveLength(2)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps duplicate-titled section inputs mounted and focused while renaming', async () => {
    const save = vi.fn(async (update: Update) => Response.json(snapshot(update.payload, 2)))
    await workspace(save, {
      ...initialPayload,
      sections: [
        { title: 'Original', items: [] },
        { title: 'Original', items: [] },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: copy.edit }))
    const input = screen.getAllByRole('textbox', { name: copy.sectionName })[0]
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing section name input')
    input.focus()
    fireEvent.change(input, { target: { value: 'OriginalX' } })
    fireEvent.change(input, { target: { value: 'OriginalXY' } })
    expect(screen.getAllByRole('textbox', { name: copy.sectionName })[0]).toBe(input)
    expect(input).toHaveFocus()
    expect(input).toHaveValue('OriginalXY')
    await advance(650)
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]?.[0].payload.sections).toEqual([
      { title: 'OriginalXY', items: [] },
      { title: 'Original', items: [] },
    ])
  })

  it('pauses a revision conflict, retains new edits, and exports the complete current draft', async () => {
    let complete: ((response: Response) => void) | undefined
    const save = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve
        }),
    )
    await workspace(save)
    fireEvent.click(engineButton('Baidu'))
    await advance(650)
    await act(async () =>
      complete?.(Response.json({ error: 'revision_conflict' }, { status: 409 })),
    )
    fireEvent.click(engineButton('Google'))
    await advance(5000)
    expect(save).toHaveBeenCalledOnce()
    expect(engineButton('Bing')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(copy.conflict)
    expect(screen.queryByRole('button', { name: copy.retrySave })).not.toBeInTheDocument()

    const createObjectURL = vi.fn((_blob: Blob) => 'blob:draft')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = createObjectURL
        static override revokeObjectURL = revokeObjectURL
      },
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: copy.exportDraft }))
    const blob = createObjectURL.mock.calls[0]?.[0]
    if (!(blob instanceof Blob)) throw new Error('Missing draft download')
    vi.useRealTimers()
    const exported = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blob)
    })
    expect(startPayloadSchema.parse(JSON.parse(exported) as unknown)).toEqual({
      ...initialPayload,
      engine: 'bing',
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:draft')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: copy.reload }))
    expect(confirm).toHaveBeenCalledWith(copy.reloadConfirm)
    expect(engineButton('Bing')).toBeVisible()
    expect(save).toHaveBeenCalledOnce()
  })

  it.each(['http', 'network', 'invalid-response'] as const)(
    'pauses a %s failure and retries only on explicit request with the latest draft',
    async (failure) => {
      let attempt = 0
      const save = vi.fn(async (update: Update) => {
        attempt += 1
        if (attempt > 1) return Response.json(snapshot(update.payload, 2))
        if (failure === 'network') throw new Error('offline')
        return failure === 'http'
          ? Response.json({ error: 'unavailable' }, { status: 503 })
          : Response.json({ invalid: true })
      })
      await workspace(save)
      fireEvent.click(engineButton('Baidu'))
      await advance(650)
      expect(screen.getByRole('status')).toHaveTextContent(copy.saveFailed)
      fireEvent.click(engineButton('Google'))
      await advance(5000)
      expect(save).toHaveBeenCalledOnce()
      fireEvent.click(screen.getByRole('button', { name: copy.retrySave }))
      await advance(650)
      expect(save).toHaveBeenCalledTimes(2)
      expect(save.mock.calls[1]?.[0].expectedRevision).toBe(1)
      expect(save.mock.calls[1]?.[0].payload.engine).toBe('bing')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    },
  )
})
