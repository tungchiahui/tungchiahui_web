'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

export function ThemeToggle({ label }: Readonly<{ label: string }>) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('site-theme')
    const enabled =
      stored === 'dark' || (stored === null && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', enabled)
    document.documentElement.classList.toggle('light', !enabled)
    setDark(enabled)
  }, [])

  function toggle() {
    const enabled = !dark
    document.documentElement.classList.toggle('dark', enabled)
    document.documentElement.classList.toggle('light', !enabled)
    localStorage.setItem('site-theme', enabled ? 'dark' : 'light')
    setDark(enabled)
  }

  return (
    <Button aria-label={label} className="size-9 px-0" onClick={toggle} type="button">
      {dark ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
    </Button>
  )
}
