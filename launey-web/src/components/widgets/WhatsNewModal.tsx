import { X } from '@phosphor-icons/react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { WhatsNewIntroPage } from './WhatsNewIntroPage'
import { WhatsNewStepPage } from './WhatsNewFeaturePage'
import { WhatsNewOutroPage } from './WhatsNewOutroPage'
import { FlowingGradientBackground } from './FlowingGradientBackground'
import type { WhatsNewPageData } from './whatsNewData'
import { WHATS_NEW_INTRO_PAGE, WHATS_NEW_STEP_PAGES } from './whatsNewData'
import './AddUrlModal.css'
import './WhatsNewModal.css'

interface WhatsNewModalProps {
  page?: WhatsNewPageData
  onClose: () => void
  onLearnMore?: () => void
  onNext?: () => void
  onBack?: () => void
  onStart?: () => void
}

export function WhatsNewModal({ page = WHATS_NEW_INTRO_PAGE, onClose, onLearnMore, onNext, onBack, onStart }: WhatsNewModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const detailBrand = page.type === 'step' ? page.step : page.type === 'outro' ? page.outro : null

  return (
    <section className="modal-surface whats-new-modal" aria-modal="true" aria-labelledby="whats-new-title">
      <img
        className="whats-new-intro-background"
        src={WHATS_NEW_INTRO_PAGE.type === 'intro' ? WHATS_NEW_INTRO_PAGE.intro.image : ''}
        alt=""
        aria-hidden="true"
      />
      <FlowingGradientBackground />
      <div className="whats-new-intro-gradient" aria-hidden="true" />

      {detailBrand ? (
        <div className="whats-new-feature-brand" aria-hidden="true">
          <img className="whats-new-feature-version" src={detailBrand.versionBackground} alt="" />
          <img className="whats-new-feature-logo" src={detailBrand.logo} alt="" />
        </div>
      ) : null}

      {page.type !== 'intro' ? (
        <WhatsNewPersistentCopy
          page={page}
          shouldReduceMotion={shouldReduceMotion}
          onNext={onNext ?? onClose}
          onBack={onBack ?? onStart ?? onClose}
          onFinish={onClose}
        />
      ) : null}

      <AnimatePresence initial={false}>
        <motion.div
          key={page.id}
          className="whats-new-page-transition"
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              duration: shouldReduceMotion ? 0.14 : 0.36,
              delay: 0,
              ease: [0.22, 1, 0.36, 1],
            },
          }}
          exit={{
            opacity: 0,
            y: shouldReduceMotion ? 0 : -6,
            transition: {
              duration: shouldReduceMotion ? 0.12 : 0.28,
              ease: [0.4, 0, 0.2, 1],
            },
          }}
        >
          {page.type === 'intro' ? (
            <WhatsNewIntroPage
              data={page.intro}
              onSkip={onClose}
              onLearnMore={onLearnMore ?? onClose}
            />
          ) : page.type === 'step' ? (
            <WhatsNewStepPage
              data={page.step}
              stepCount={WHATS_NEW_STEP_PAGES.length}
              onSkip={onClose}
              onNext={onNext ?? onClose}
              mediaOnly
            />
          ) : (
            <WhatsNewOutroPage
              data={page.outro}
              previousPageCount={WHATS_NEW_STEP_PAGES.length}
              onStart={onBack ?? onStart ?? onClose}
              onFinish={onClose}
              mediaOnly
            />
          )}
        </motion.div>
      </AnimatePresence>

      <button type="button" className="modal-close whats-new-close" aria-label="Закрыть" onClick={onClose}>
        <X size={20} weight="bold" />
      </button>
    </section>
  )
}

function WhatsNewPersistentCopy({
  page,
  shouldReduceMotion,
  onNext,
  onBack,
  onFinish,
}: {
  page: Exclude<WhatsNewPageData, { type: 'intro' }>
  shouldReduceMotion: boolean
  onNext: () => void
  onBack: () => void
  onFinish: () => void
}) {
  const data = page.type === 'step' ? page.step : page.outro
  const pageCount = WHATS_NEW_STEP_PAGES.length + 1
  const activePage = page.type === 'step' ? page.step.step - 1 : pageCount - 1

  return (
    <div className="whats-new-persistent-copy-layer">
      <div className="whats-new-feature-copy whats-new-feature-copy-persistent">
        <div className="whats-new-feature-copy-swap">
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={page.id}
              className="whats-new-feature-copy-state"
              initial={{ opacity: 0, filter: shouldReduceMotion ? 'none' : 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: shouldReduceMotion ? 'none' : 'blur(8px)' }}
              transition={{
                duration: shouldReduceMotion ? 0.12 : 0.46,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div className="whats-new-feature-text">
                <p className="whats-new-feature-eyebrow">{data.eyebrow}</p>
                <h2 id="whats-new-title" className="whats-new-feature-title">{data.title}</h2>
                <p className="whats-new-feature-description">{data.description}</p>
              </div>

              <div className="whats-new-feature-actions">
                {activePage > 0 ? (
                  <button
                    type="button"
                    className="modal-button modal-button-secondary"
                    onClick={onBack}
                  >
                    Назад
                  </button>
                ) : null}
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={page.type === 'step' ? onNext : onFinish}
                >
                  {page.type === 'step' ? 'Далее' : 'Завершить'}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <LayoutGroup id="whats-new-pagination">
          <div className="whats-new-feature-progress whats-new-feature-progress-persistent" aria-label={`Страница ${activePage + 1} из ${pageCount}`}>
            {Array.from({ length: pageCount }, (_, index) => (
              <span className="whats-new-progress-slot" key={index}>
                {index === activePage ? (
                  <motion.span
                    className="whats-new-progress-active-pill"
                    layoutId="whats-new-progress-active-pill"
                    transition={{ duration: shouldReduceMotion ? 0.12 : 0.48, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
              </span>
            ))}
          </div>
        </LayoutGroup>
      </div>
    </div>
  )
}
