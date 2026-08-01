import { useEffect, useState, type UIEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import changelogLogoForDarkTheme from '../../assets/whats-new/settings/launey-dark.png'
import changelogLogoForLightTheme from '../../assets/whats-new/settings/launey-release-light.png'
import { ModalPortal } from './ModalPortal'
import { FlowingGradientBackground } from './FlowingGradientBackground'
import { OUTRO_FLOW_COLORS } from './WhatsNewOutroPage'
import { WHATS_NEW_OUTRO_PAGE } from './whatsNewData'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './ReleaseChangelogModal.css'

const LIGHT_RELEASE_FLOW_COLORS = [
  '#f4c7a1',
  '#ffd967',
  '#bfe3c4',
  '#d7edf6',
  '#f4dfc8',
  '#fff4d2',
] as const

interface ReleaseChangelogModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ReleaseChangelogModal({ isOpen, onClose }: ReleaseChangelogModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="modal-backdrop release-changelog-backdrop"
            role="presentation"
            {...getModalBackdropAnimation(shouldReduceMotion)}
            transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onClose()
            }}
          >
            <motion.section
              className="modal-surface release-changelog-window"
              role="dialog"
              aria-modal="true"
              aria-labelledby="release-changelog-title"
              {...getCenteredModalAnimation(shouldReduceMotion)}
              transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
            >
              <ReleaseChangelogSidebar onClose={onClose} />
              <ReleaseChangelogFeed onClose={onClose} />
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}

function ReleaseChangelogSidebar({ onClose }: { onClose: () => void }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark')

  useEffect(() => {
    const root = document.documentElement
    const updateTheme = () => setTheme(root.dataset.theme ?? 'dark')
    const observer = new MutationObserver(updateTheme)

    updateTheme()
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <aside className="release-changelog-sidebar">
      <span className="release-changelog-logo" aria-label="Launey 0.1.5">
        <img
          src={theme === 'light' ? changelogLogoForLightTheme : changelogLogoForDarkTheme}
          alt=""
        />
      </span>

      <div className="release-changelog-intro">
        <h2 id="release-changelog-title">Добро пожаловать<br />в Launey 0.1.5</h2>
        <p>Новые возможности, обновлённые инструменты и более цельный визуальный стиль.</p>
      </div>

      <button type="button" className="modal-button modal-button-primary release-changelog-ready" onClick={onClose}>
        Продолжить
      </button>
    </aside>
  )
}

function ReleaseChangelogFeed({ onClose }: { onClose: () => void }) {
  const [titleOpacity, setTitleOpacity] = useState(1)
  const release = WHATS_NEW_OUTRO_PAGE.type === 'outro' ? WHATS_NEW_OUTRO_PAGE.outro : null

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setTitleOpacity(Math.max(0, Math.min(1, 1 - event.currentTarget.scrollTop / 72)))
  }

  if (!release) return null

  return (
    <section className="release-changelog-feed">
      <div className="release-changelog-gradient release-changelog-gradient-dark" aria-hidden="true">
        <FlowingGradientBackground colors={OUTRO_FLOW_COLORS} />
      </div>
      <div className="release-changelog-gradient release-changelog-gradient-light" aria-hidden="true">
        <FlowingGradientBackground colors={LIGHT_RELEASE_FLOW_COLORS} />
      </div>
      <div className="release-changelog-feed-shade" aria-hidden="true" />

      <button className="modal-close release-changelog-close" type="button" aria-label="Закрыть" onClick={onClose}>
        <X size={18} weight="bold" />
      </button>

      <h3 className="release-changelog-feed-title" style={{ opacity: titleOpacity }}>
        {release.panelTitle}
      </h3>

      <div className="release-changelog-scroll" onScroll={handleScroll}>
        <div className="release-changelog-messages">
          {release.messages.map((message, index) => (
            <article className="release-changelog-message" key={`${index}-${message}`}>
              {message}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
