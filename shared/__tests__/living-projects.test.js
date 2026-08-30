import { describe, it, expect } from 'vitest'
import {
  LIVING_PROJECT_TYPES,
  STAGE_TYPES,
  normalizeLivingProject,
  createSourdoughProjectTemplate,
  advanceLivingProjectStage,
} from '../living-projects.js'

describe('living-projects helpers', () => {
  it('creates and normalizes a sourdough multi-day project template', () => {
    const project = createSourdoughProjectTemplate({ title: 'Country Sourdough' })
    expect(project.title).toBe('Country Sourdough')
    expect(project.type).toBe(LIVING_PROJECT_TYPES.SOURDOUGH)
    expect(project.stageGraph).toHaveLength(4)
    expect(project.stageGraph[0].type).toBe(STAGE_TYPES.AUTOLYSE)
    expect(project.stageGraph[1].type).toBe(STAGE_TYPES.BULK)
    expect(project.stageGraph[2].type).toBe(STAGE_TYPES.RETARD)
    expect(project.status).toBe('active')
  })

  it('advances through stages updating completion timestamp and next check-in', () => {
    const project = createSourdoughProjectTemplate()
    expect(project.activeStageIndex).toBe(0)

    const stage1Completed = advanceLivingProjectStage(project)
    expect(stage1Completed.activeStageIndex).toBe(1)
    expect(stage1Completed.stageGraph[0].completedAt).not.toBeNull()
    expect(stage1Completed.status).toBe('active')

    // Advance remaining stages
    const stage2 = advanceLivingProjectStage(stage1Completed)
    const stage3 = advanceLivingProjectStage(stage2)
    const finalStage = advanceLivingProjectStage(stage3)

    expect(finalStage.status).toBe('completed')
    expect(finalStage.nextCheckInAt).toBeNull()
  })
})
