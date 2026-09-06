'use client'

import { Button } from '@/components/ui/button'

export function PrintButton({ label }: Readonly<{ label: string }>) {
  return (
    <Button className="mt-8 print:hidden" onClick={() => window.print()} type="button">
      {label}
    </Button>
  )
}
