import { useState, type UIEvent } from 'react'
import { FlowingGradientBackground } from './FlowingGradientBackground'
import type { WhatsNewOutroData } from './whatsNewData'
import { SubtleTiltCard } from './SubtleTiltCard'

export const OUTRO_FLOW_COLORS = [
  '#071426',
  '#0b3154',
  '#164d66',
  '#1d6b61',
  '#8c8a28',
  '#020508',
] as const

interface WhatsNewOutroPageProps {
  data: WhatsNewOutroData
  previousPageCount: number
  onStart: () => void
  onFinish: () => void
  mediaOnly?: boolean
}

export function WhatsNewOutroPage({
  data,
  previousPageCount,
  onStart,
  onFinish,
  mediaOnly = false,
}: WhatsNewOutroPageProps) {
  const [titleOpacity, setTitleOpacity] = useState(1)

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const nextOpacity = Math.max(0, Math.min(1, 1 - event.currentTarget.scrollTop / 72))
    setTitleOpacity(nextOpacity)
  }

  return (
    <div className="whats-new-feature-page whats-new-outro-page">
      <div className="whats-new-feature-layout">
        {!mediaOnly ? <div className="whats-new-feature-copy">
          <div className="whats-new-feature-text">
            <p className="whats-new-feature-eyebrow">{data.eyebrow}</p>
            <h2 id="whats-new-title" className="whats-new-feature-title">{data.title}</h2>
            <p className="whats-new-feature-description">{data.description}</p>
          </div>

          <div className="whats-new-feature-actions">
            <button type="button" className="modal-button modal-button-secondary" onClick={onStart}>
              В начало
            </button>
            <button type="button" className="modal-button modal-button-primary" onClick={onFinish}>
              Завершить
            </button>
          </div>

          <div className="whats-new-feature-progress" aria-label="Финальная страница">
            {Array.from({ length: previousPageCount }, (_, index) => <span key={index} />)}
            <span className="is-active" />
          </div>
        </div> : <div />}

        <div className="whats-new-feature-media-stage">
          <SubtleTiltCard className="whats-new-feature-media whats-new-outro-media">
            <div className="whats-new-outro-gradient">
              <FlowingGradientBackground colors={OUTRO_FLOW_COLORS} />
            </div>

            <h3 className="whats-new-outro-panel-title" style={{ opacity: titleOpacity }}>
              {data.panelTitle}
            </h3>

            <div className="whats-new-outro-scroll" onScroll={handleScroll}>
              <div className="whats-new-outro-messages">
                {data.messages.map((message, index) => (
                  <article className="whats-new-outro-message" key={`${index}-${message}`}>
                    {message}
                  </article>
                ))}
              </div>
            </div>
          </SubtleTiltCard>
        </div>
      </div>
    </div>
  )
}
