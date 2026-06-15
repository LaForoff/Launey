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

interface DeleteSpaceModalProps {
  isOpen: boolean
  title: string
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteSpaceModal({
  isOpen,
  title,
  onCancel,
  onConfirm,
}: DeleteSpaceModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="modal-backdrop modal-backdrop-strong"
            role="presentation"
            {...getModalBackdropAnimation(shouldReduceMotion)}
            transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
          >
            <motion.section
              className="add-url-modal delete-url-modal"
              aria-labelledby="delete-space-title"
              {...getCenteredModalAnimation(shouldReduceMotion)}
              transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
            >
            <div className="modal-header">
              <h2 id="delete-space-title">Удалить пространство?</h2>
              <button className="modal-close" type="button" aria-label="Закрыть" onClick={onCancel}>
                <X size={18} weight="bold" />
              </button>
            </div>
            <p className="delete-url-text">
              Вы действительно хотите удалить пространство «{title}»? Все имеющиеся ярлыки и папки
              будут безвозвратно удалены!
            </p>
            <div className="modal-actions">
              <button
                className="modal-button modal-button-destructive"
                type="button"
                onClick={onConfirm}
              >
                Удалить
              </button>
              <button className="modal-button modal-button-secondary" type="button" onClick={onCancel}>
                Отмена
              </button>
            </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}
