import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlanInterchangeModal from '../PlanInterchangeModal.jsx'

const CSV = [
  'date,slot,title,ingredients',
  '2026-10-05,dinner,Lemon chicken,"1 lemon; chicken thighs"',
].join('\n')

describe('PlanInterchangeModal', () => {
  const baseProps = {
    open: true,
    onClose: jest.fn(),
    onCommit: jest.fn(),
    mealPlan: {},
    upNext: [],
    groceryList: [],
  }

  beforeEach(() => jest.clearAllMocks())

  it('previews a pasted week and commits only after the report passes', async () => {
    const user = userEvent.setup()
    render(<PlanInterchangeModal {...baseProps} />)

    await user.type(screen.getByLabelText(/paste the file contents/i), CSV)
    await user.click(screen.getByRole('button', { name: /preview import/i }))

    expect(screen.getByText(/ready to import/i)).toBeInTheDocument()
    expect(screen.getByText(/1 mapped, 0 partial, 0 skipped/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /replace current week/i }))
    expect(baseProps.onCommit).toHaveBeenCalledWith(expect.objectContaining({
      mealPlan: expect.objectContaining({ '2026-10-05': expect.any(Object) }),
    }))
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('keeps the commit action disabled for a hard-allergen conflict', async () => {
    const user = userEvent.setup()
    render(<PlanInterchangeModal {...baseProps} hardAllergens={['peanuts']} />)

    await user.type(
      screen.getByLabelText(/paste the file contents/i),
      CSV.replace('chicken thighs', '2 tbsp peanut butter'),
    )
    await user.click(screen.getByRole('button', { name: /preview import/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/import blocked/i)
    expect(screen.getByRole('button', { name: /replace current week/i })).toBeDisabled()
    expect(baseProps.onCommit).not.toHaveBeenCalled()
  })
})
