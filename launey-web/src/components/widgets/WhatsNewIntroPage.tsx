import type { WhatsNewIntroData } from './whatsNewData'

interface WhatsNewIntroPageProps {
  data: WhatsNewIntroData
  onSkip: () => void
  onLearnMore: () => void
}

export function WhatsNewIntroPage({ data, onSkip, onLearnMore }: WhatsNewIntroPageProps) {
  return (
    <div className="whats-new-intro-page">
      <img
        className="whats-new-intro-version"
        src={data.versionBackground}
        alt=""
        aria-hidden="true"
      />

      <div className="whats-new-intro-content">
        <div className="whats-new-intro-hero">
          <p id="whats-new-title" className="whats-new-intro-title">{data.title}</p>
          <img className="whats-new-intro-logo" src={data.logo} alt={`Launey ${data.version}`} />
        </div>

        <div className="whats-new-intro-footer">
          <p className="whats-new-intro-description">{data.description}</p>

          <div className="whats-new-intro-actions">
            <button type="button" className="modal-button modal-button-secondary" onClick={onSkip}>
              Пропустить
            </button>
            <button type="button" className="modal-button modal-button-primary" onClick={onLearnMore}>
              Узнать больше
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
