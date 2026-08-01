import type { WhatsNewStepData } from './whatsNewData'
import { SubtleTiltCard } from './SubtleTiltCard'

interface WhatsNewStepPageProps {
  data: WhatsNewStepData
  stepCount: number
  onSkip: () => void
  onNext: () => void
  mediaOnly?: boolean
}

export function WhatsNewStepPage({ data, stepCount, onSkip, onNext, mediaOnly = false }: WhatsNewStepPageProps) {
  return (
    <div className="whats-new-feature-page">
      <div className="whats-new-feature-layout">
        {!mediaOnly ? <div className="whats-new-feature-copy">
          <div className="whats-new-feature-text">
            <p className="whats-new-feature-eyebrow">{data.eyebrow}</p>
            <h2 id="whats-new-title" className="whats-new-feature-title">{data.title}</h2>
            <p className="whats-new-feature-description">{data.description}</p>
          </div>

          <div className="whats-new-feature-actions">
            <button type="button" className="modal-button modal-button-secondary" onClick={onSkip}>
              Пропустить
            </button>
            <button type="button" className="modal-button modal-button-primary" onClick={onNext}>
              Далее
            </button>
          </div>

          <div className="whats-new-feature-progress" aria-label={`Шаг ${data.step} из ${stepCount}`}>
            {Array.from({ length: stepCount }, (_, index) => (
              <span key={index} className={index + 1 === data.step ? 'is-active' : ''} />
            ))}
          </div>
        </div> : <div />}

        <div className="whats-new-feature-media-stage">
          <SubtleTiltCard className="whats-new-feature-media">
            <img src={data.image} alt="Демонстрация создания папки перетаскиванием" />
          </SubtleTiltCard>
        </div>
      </div>
    </div>
  )
}
