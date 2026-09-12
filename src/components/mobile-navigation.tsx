'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function MobileNavigation({
  buttonLabel,
  closeLabel,
  links,
  navigationLabel,
}: Readonly<{
  buttonLabel: string
  closeLabel: string
  links: readonly Readonly<{ href: string; label: string }>[]
  navigationLabel: string
}>) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="relative sm:hidden" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={buttonLabel}
        className="relative z-40 grid size-10 place-items-center rounded-full border bg-card shadow-sm transition hover:border-primary hover:text-primary"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {open ? <X aria-hidden size={19} /> : <Menu aria-hidden size={19} />}
      </button>
      {open
        ? createPortal(
            <>
              <button
                aria-label={closeLabel}
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] sm:hidden"
                data-mobile-menu-backdrop
                onClick={() => setOpen(false)}
                type="button"
              />
              <nav
                aria-label={navigationLabel}
                className="fixed top-[4.5rem] right-4 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur sm:hidden"
              >
                <p className="px-2 pt-1 pb-3 font-semibold text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  {navigationLabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {links.map((link) => {
                    const active = pathname === link.href
                    return (
                      <Link
                        aria-current={active ? 'page' : undefined}
                        className={
                          active
                            ? 'rounded-xl bg-primary px-3 py-3 font-medium text-primary-foreground text-sm'
                            : 'rounded-xl border bg-card px-3 py-3 text-sm transition hover:border-primary hover:text-primary'
                        }
                        href={link.href}
                        key={link.href}
                        onClick={() => setOpen(false)}
                      >
                        {link.label}
                      </Link>
                    )
                  })}
                </div>
              </nav>
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
