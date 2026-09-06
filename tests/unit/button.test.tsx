import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('uses the Base UI interaction boundary', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<Button onClick={onClick}>Activate</Button>)
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
