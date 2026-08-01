import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ModalPortal } from './ModalPortal'
import { WhatsNewModal } from './WhatsNewModal'
import type { WhatsNewPageData } from './whatsNewData'
import {
  WHATS_NEW_FOLDERS_STEP,
  WHATS_NEW_INTRO_PAGE,
  WHATS_NEW_OUTRO_PAGE,
  WHATS_NEW_STEP_PAGES,
} from './whatsNewData'
import {
  MODAL_EASE,
} from './modalMotion'

const WHATS_NEW_EXIT_EASE = [0.4, 0, 0.2, 1] as const

interface WhatsNewOverlayProps {
  page?: WhatsNewPageData
  onClose: () => void
}

export function WhatsNewOverlay({ page = WHATS_NEW_INTRO_PAGE, onClose }: WhatsNewOverlayProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [isVisible, setIsVisible] = useState(true)
  const [currentPage, setCurrentPage] = useState(page)

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

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      handleClose()
    }
  }

  function handleNextPage() {
    if (currentPage.type !== 'step') {
      return
    }

    const currentStepIndex = WHATS_NEW_STEP_PAGES.findIndex(({ id }) => id === currentPage.id)
    setCurrentPage(WHATS_NEW_STEP_PAGES[currentStepIndex + 1] ?? WHATS_NEW_OUTRO_PAGE)
  }

  function handlePreviousPage() {
    if (currentPage.type === 'outro') {
      setCurrentPage(WHATS_NEW_STEP_PAGES[WHATS_NEW_STEP_PAGES.length - 1] ?? WHATS_NEW_FOLDERS_STEP)
      return
    }

    if (currentPage.type !== 'step') {
      return
    }

    const currentStepIndex = WHATS_NEW_STEP_PAGES.findIndex(({ id }) => id === currentPage.id)
    const previousStep = WHATS_NEW_STEP_PAGES[currentStepIndex - 1]

    if (previousStep) {
      setCurrentPage(previousStep)
    }
  }

  return (
    <ModalPortal>
      <AnimatePresence onExitComplete={onClose}>
        {isVisible ? (
          <motion.div
            className="modal-backdrop whats-new-overlay"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: {
                duration: shouldReduceMotion ? 0.14 : 1.2,
                ease: WHATS_NEW_EXIT_EASE,
              },
            }}
            transition={{ duration: shouldReduceMotion ? 0.14 : 0.8, ease: MODAL_EASE }}
            onPointerDown={handleBackdropPointerDown}
          >
            <motion.div
              className="whats-new-overlay-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: {
                  duration: shouldReduceMotion ? 0.14 : 1.05,
                  ease: WHATS_NEW_EXIT_EASE,
                },
              }}
              transition={{
                duration: shouldReduceMotion ? 0.14 : 1.05,
                delay: shouldReduceMotion ? 0 : 0.08,
                ease: MODAL_EASE,
              }}
            >
              <WhatsNewModal
                page={currentPage}
                onClose={handleClose}
                onLearnMore={() => setCurrentPage(WHATS_NEW_FOLDERS_STEP)}
                onNext={handleNextPage}
                onBack={handlePreviousPage}
                onStart={() => setCurrentPage(WHATS_NEW_INTRO_PAGE)}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}
