'use client'

import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

const themeModes = ['system', 'dark', 'light'] as const
type ThemeMode = (typeof themeModes)[number]

function isThemeMode(value: string | null): value is ThemeMode {
  return themeModes.some((mode) => mode === value)
}

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
}

const icons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} satisfies Record<ThemeMode, typeof Monitor>

export function ThemeToggle({
  labels,
}: Readonly<{
  labels: Readonly<Record<ThemeMode, string> & { menu: string }>
}>) {
  const [mode, setMode] = useState<ThemeMode>('system')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem('site-theme')
    const selected = isThemeMode(stored) ? stored : 'system'
    setMode(selected)
    applyTheme(selected)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      if (mode === 'system') applyTheme('system')
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [mode])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false)
        return
      }
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [open])

  function select(nextMode: ThemeMode) {
    localStorage.setItem('site-theme', nextMode)
    setMode(nextMode)
    applyTheme(nextMode)
    setOpen(false)
  }

  const CurrentIcon = icons[mode]
  return (
    <div className="relative" ref={rootRef}>
      <Button
        aria-expanded={open}
        aria-label={labels.menu}
        className="size-10 rounded-full px-0"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <CurrentIcon aria-hidden="true" size={18} />
      </Button>
      {open ? (
        <div
          aria-label={labels.menu}
          className="absolute top-[calc(100%+0.65rem)] right-0 z-50 grid w-44 gap-1 rounded-2xl border bg-background/95 p-2 shadow-2xl backdrop-blur"
          role="menu"
        >
          {themeModes.map((item) => {
            const Icon = icons[item]
            const selected = item === mode
            return (
              <button
                aria-checked={selected}
                className={
                  selected
                    ? 'flex items-center gap-3 rounded-xl bg-primary px-3 py-2.5 text-left text-primary-foreground text-sm'
                    : 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-card'
                }
                key={item}
                onClick={() => select(item)}
                role="menuitemradio"
                type="button"
              >
                <Icon aria-hidden size={17} />
                <span className="flex-1">{labels[item]}</span>
                {selected ? <Check aria-hidden size={15} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
