'use client'

import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function Button({ className, ...props }: ComponentProps<typeof ButtonPrimitive>) {
  return (
    <ButtonPrimitive
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
