import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ModalPortal } from './ModalPortal'
import { MODAL_EASE, getModalBackdropAnimation } from './modalMotion'

interface PersistentModalBackdropProps {
  isOpen: boolean
}

export function PersistentModalBackdrop({ isOpen }: PersistentModalBackdropProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="modal-backdrop persistent-modal-backdrop"
            aria-hidden="true"
            {...getModalBackdropAnimation(shouldReduceMotion)}
            transition={{ duration: shouldReduceMotion ? 0.14 : 0.24, ease: MODAL_EASE }}
          />
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}
