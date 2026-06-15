import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import logoLauney from '../../assets/logo-launey.png'
import updImageCover from '../../assets/upd-image-cover.png'
import { ReleaseNotesMarkdown } from '../ui/ReleaseNotesMarkdown'
import {
  clearCompletedUpdate,
  type UpdateRelease,
} from '../../lib/updateService'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'
import './PostUpdateModal.css'

interface PostUpdateModalProps {
  release: UpdateRelease
  onClose: () => void
}

export function PostUpdateModal({ release, onClose }: PostUpdateModalProps) {
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

  function handleClose() {
    setIsVisible(false)
  }

  function handleExitComplete() {
    clearCompletedUpdate()
    onClose()
  }

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      handleClose()
    }
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
            <motion.section
              className="modal-surface post-update-modal"
              aria-modal="true"
              aria-label="Launey обновился"
              {...getCenteredModalAnimation(shouldReduceMotion)}
              transition={{ duration: shouldReduceMotion ? 0.14 : 0.24, ease: MODAL_EASE }}
            >
              <header className="post-update-modal-cover">
                <img className="post-update-modal-cover-image" src={updImageCover} alt="" />
                <div className="post-update-modal-cover-brand">
                  <img src={logoLauney} alt="" />
                </div>
                <button type="button" className="modal-close" aria-label="Закрыть" onClick={handleClose}>
                  <X size={18} weight="bold" />
                </button>
              </header>

              <div className="post-update-modal-content">
                <div className="post-update-version">
                  <strong>Встречайте, Launey {release.version}</strong>
                </div>

                <div className="post-update-notes">
                  <h3>О последнем обновлении</h3>
                  <ReleaseNotesMarkdown markdown={release.releaseNotesMarkdown} />
                </div>
              </div>

              <footer className="post-update-modal-footer">
                <button type="button" className="modal-button modal-button-primary" onClick={handleClose}>
                  Начать работу
                </button>
              </footer>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}
