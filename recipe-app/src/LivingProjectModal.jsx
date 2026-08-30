import React from 'react'
import { useFlag } from './flaggly.js'
import { advanceLivingProjectStage } from '../../shared/living-projects.js'

export default function LivingProjectModal({
  isOpen,
  onClose,
  project,
  onUpdateProject,
}) {
  const livingProjectsEnabled = useFlag('living-projects')

  if (!isOpen || !livingProjectsEnabled || !project) return null

  const activeStage = project.stageGraph?.[project.activeStageIndex]
  const isCompleted = project.status === 'completed' || project.activeStageIndex >= (project.stageGraph?.length || 0)

  function handleAdvance() {
    const updated = advanceLivingProjectStage(project)
    onUpdateProject(updated)
  }

  return (
    <div className="living-project-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="living-project-title">
      <div className="living-project-modal-card">
        <div className="living-project-header">
          <div>
            <span className="living-project-badge">🌱 Living Cook Project</span>
            <h2 id="living-project-title">{project.title}</h2>
          </div>
          <button type="button" className="living-project-close-btn" onClick={onClose} aria-label="Close project">
            ✕
          </button>
        </div>

        <div className="living-project-body">
          {/* Progress Stage Tracker */}
          <div className="living-project-timeline">
            {project.stageGraph?.map((stage, idx) => {
              const isCurrent = idx === project.activeStageIndex
              const isPast = idx < project.activeStageIndex || stage.completedAt
              return (
                <div
                  key={stage.id}
                  className={`living-stage-step${isCurrent ? ' living-stage-step--current' : ''}${isPast ? ' living-stage-step--past' : ''}`}
                >
                  <div className="living-stage-dot">{isPast ? '✓' : idx + 1}</div>
                  <div className="living-stage-info">
                    <strong>{stage.name}</strong>
                    <small>~{stage.durationHours}h · {stage.type}</small>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Active Stage Card */}
          <div className="living-active-stage-card">
            {isCompleted ? (
              <div className="living-stage-completed-view">
                <h3>🎉 Project Completed!</h3>
                <p>All fermentation and baking stages have finished.</p>
              </div>
            ) : activeStage ? (
              <>
                <div className="living-active-stage-header">
                  <span className="living-active-stage-label">Current Stage ({project.activeStageIndex + 1} of {project.stageGraph.length})</span>
                  <h3>{activeStage.name}</h3>
                </div>

                <div className="living-active-instructions">
                  <strong>Instructions:</strong>
                  <ul>
                    {activeStage.instructions.map((inst, i) => (
                      <li key={i}>{inst}</li>
                    ))}
                  </ul>
                </div>

                {activeStage.conditionHints?.length > 0 && (
                  <div className="living-condition-hints">
                    <strong>Visual / Texture Check-in cues:</strong>
                    <ul>
                      {activeStage.conditionHints.map((hint, i) => (
                        <li key={i}>🔍 {hint}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="living-stage-actions">
                  <button
                    type="button"
                    className="living-advance-btn"
                    onClick={handleAdvance}
                  >
                    Complete Stage & Advance →
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
