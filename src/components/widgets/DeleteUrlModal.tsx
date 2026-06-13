import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'

interface DeleteUrlModalProps {
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteUrlModal({ isOpen, onCancel, onConfirm }: DeleteUrlModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <AnimatePresence>
      {isOpen ? (
        <ModalPortal>
          <motion.div
            className="modal-backdrop"
            role="presentation"
            {...getModalBackdropAnimation(shouldReduceMotion)}
            transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
          >
            <motion.section
              className="add-url-modal delete-url-modal"
              aria-labelledby="delete-url-title"
              {...getCenteredModalAnimation(shouldReduceMotion)}
              transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
            >
            <div className="modal-header">
              <h2 id="delete-url-title">Удалить URL?</h2>
              <button className="modal-close" type="button" aria-label="Закрыть" onClick={onCancel}>
                <X size={18} weight="bold" />
              </button>
            </div>
            <p className="delete-url-text">Это действие нельзя будет отменить.</p>
            <div className="modal-actions">
              <button className="modal-button modal-button-secondary" type="button" onClick={onCancel}>
                Отмена
              </button>
              <button
                className="modal-button modal-button-destructive"
                type="button"
                onClick={onConfirm}
              >
                Удалить
              </button>
            </div>
            </motion.section>
          </motion.div>
        </ModalPortal>
      ) : null}
    </AnimatePresence>
  )
}
