import { type FormEvent, useId, useState } from 'react'
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
import './RenameSpaceModal.css'

interface CreateSpaceModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (title: string) => void
}

export function CreateSpaceModal({ isOpen, onClose, onCreate }: CreateSpaceModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen ? (
          <CreateSpaceModalForm onClose={onClose} onCreate={onCreate} shouldReduceMotion={shouldReduceMotion} />
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}

interface CreateSpaceModalFormProps {
  onClose: () => void
  onCreate: (title: string) => void
  shouldReduceMotion: boolean
}

function CreateSpaceModalForm({ onClose, onCreate, shouldReduceMotion }: CreateSpaceModalFormProps) {
  const titleId = useId()
  const [title, setTitle] = useState('')
  const canCreate = title.trim().length > 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canCreate) {
      return
    }

    onCreate(title.trim())
  }

  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      {...getModalBackdropAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
    >
      <motion.form
        className="add-url-modal rename-space-modal"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        {...getCenteredModalAnimation(shouldReduceMotion)}
        transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
      >
        <div className="modal-header">
          <h2 id={titleId}>Создать пространство</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="rename-space-content">
          <input
            className="modal-input rename-space-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Название пространства"
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="modal-actions rename-space-actions">
          <button className="modal-button modal-button-secondary" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="modal-button modal-button-primary" type="submit" disabled={!canCreate}>
            Создать
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}
