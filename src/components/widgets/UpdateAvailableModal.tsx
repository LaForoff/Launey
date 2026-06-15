import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import updImageCover from '../../assets/upd-image-cover.png'
import type { UpdateRelease } from '../../lib/updateService'
import { ReleaseNotesMarkdown } from '../ui/ReleaseNotesMarkdown'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'
import './UpdateAvailableModal.css'

interface UpdateAvailableModalProps {
  release: UpdateRelease
  onRemindLater: () => void
  onInstallNow: () => void
  onClose: () => void
}

interface UpdateReleaseModalSurfaceProps {
  release: UpdateRelease
  onClose: () => void
  actions?: {
    secondaryLabel: string
    onSecondary: () => void
    secondaryDisabled?: boolean
    primaryLabel: string
    onPrimary: () => void
    primaryDisabled?: boolean
  } | null
}

export function UpdateAvailableModal({
  release,
  onRemindLater,
  onInstallNow,
  onClose,
}: UpdateAvailableModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsVisible(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      setIsVisible(false)
    }
  }

  function handleExitComplete() {
    onClose()
  }

  return (
    <ModalPortal>
      <AnimatePresence onExitComplete={handleExitComplete}>
        {isVisible ? (
          <motion.div
            className="modal-backdrop"
            role="presentation"
            {...getModalBackdropAnimation(shouldReduceMotion)}
            transition={{ duration: shouldReduceMotion ? 0.14 : 0.24, ease: MODAL_EASE }}
            onPointerDown={handleBackdropPointerDown}
          >
            <UpdateReleaseModalSurface
              release={release}
              onClose={() => setIsVisible(false)}
              actions={{
                secondaryLabel: 'Напомнить позже',
                onSecondary: onRemindLater,
                primaryLabel: 'Установить сейчас',
                onPrimary: onInstallNow,
                primaryDisabled: !release.downloadUrl,
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}

export function UpdateReleaseModalSurface({
  release,
  onClose,
  actions = null,
}: UpdateReleaseModalSurfaceProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <motion.section
      className={actions ? 'modal-surface update-available-modal' : 'modal-surface update-available-modal is-readonly'}
      aria-modal="true"
      aria-label={`Доступно обновление Launey ${release.version}`}
      {...getCenteredModalAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
    >
      <header className="update-available-modal-cover">
        <img className="update-available-modal-cover-image" src={updImageCover} alt="" />
        <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
          <X size={18} weight="bold" />
        </button>
      </header>

      <div className="update-available-modal-content">
        <div className="update-available-modal-copy">
          <h2>Встречайте, Launey {release.version}</h2>
          <h3>Об этом обновлении</h3>
        </div>

        <div className="update-available-modal-notes">
          <ReleaseNotesMarkdown markdown={release.releaseNotesMarkdown} />
        </div>
      </div>

      {actions ? (
        <footer className="update-available-modal-footer">
          <button
            type="button"
            className="modal-button modal-button-secondary"
            onClick={actions.onSecondary}
            disabled={actions.secondaryDisabled}
          >
            {actions.secondaryLabel}
          </button>
          <button
            type="button"
            className="modal-button modal-button-primary"
            onClick={actions.onPrimary}
            disabled={actions.primaryDisabled}
          >
            {actions.primaryLabel}
          </button>
        </footer>
      ) : null}
    </motion.section>
  )
}
