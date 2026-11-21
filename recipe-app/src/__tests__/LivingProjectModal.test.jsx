import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import LivingProjectModal from '../LivingProjectModal.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'living-projects',
}))

describe('LivingProjectModal', () => {
  const sampleProject = {
    id: 'sourdough-1',
    type: 'sourdough',
    title: 'San Francisco Sourdough',
    activeStageIndex: 0,
    status: 'active',
    stageGraph: [
      {
        id: 'autolyse',
        name: 'Autolyse Flour & Water',
        type: 'autolyse',
        durationHours: 1,
        conditionHints: ['Flour fully hydrated'],
        instructions: ['Mix flour and water gently; let rest covered for 1 hour.'],
      },
      {
        id: 'bulk_ferment',
        name: 'Bulk Fermentation & Folds',
        type: 'bulk',
        durationHours: 4,
        conditionHints: ['Dough expanded by 30-50%'],
        instructions: ['Perform 4 stretch-and-folds spaced 30 mins apart.'],
      },
    ],
  }

  test('renders project modal with timeline stages and current instructions', () => {
    render(
      <LivingProjectModal
        isOpen={true}
        onClose={jest.fn()}
        project={sampleProject}
        onUpdateProject={jest.fn()}
      />
    )

    expect(screen.getByText('San Francisco Sourdough')).toBeInTheDocument()
    expect(screen.getAllByText('Autolyse Flour & Water').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Bulk Fermentation & Folds')).toBeInTheDocument()
    expect(screen.getByText(/Visual \/ Texture Check-in cues/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Complete Stage & Advance/i })).toBeInTheDocument()
  })

  test('advances to next stage when button is clicked', () => {
    const onUpdate = jest.fn()
    render(
      <LivingProjectModal
        isOpen={true}
        onClose={jest.fn()}
        project={sampleProject}
        onUpdateProject={onUpdate}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Complete Stage & Advance/i }))
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        activeStageIndex: 1,
      })
    )
  })
})
