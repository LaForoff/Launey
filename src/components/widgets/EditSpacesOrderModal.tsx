import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DotsSixVertical, Trash, X } from '@phosphor-icons/react'
import type { Space } from '../../types/space'
import { ModalPortal } from './ModalPortal'
import { DeleteSpaceModal } from './DeleteSpaceModal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'
import './EditSpacesOrderModal.css'

interface EditSpacesOrderModalProps {
  isOpen: boolean
  spaces: Space[]
  onClose: () => void
  onSave: (nextSpaces: Space[]) => void
}

export function EditSpacesOrderModal({ isOpen, spaces, onClose, onSave }: EditSpacesOrderModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <AnimatePresence>
      {isOpen ? (
        <ModalPortal>
          <EditSpacesOrderModalForm
            initialSpaces={spaces}
            onClose={onClose}
            onSave={onSave}
            shouldReduceMotion={shouldReduceMotion}
          />
        </ModalPortal>
      ) : null}
    </AnimatePresence>
  )
}

interface EditSpacesOrderModalFormProps {
  initialSpaces: Space[]
  onClose: () => void
  onSave: (nextSpaces: Space[]) => void
  shouldReduceMotion: boolean
}

function EditSpacesOrderModalForm({
  initialSpaces,
  onClose,
  onSave,
  shouldReduceMotion,
}: EditSpacesOrderModalFormProps) {
  const [draftSpaces, setDraftSpaces] = useState<Space[]>(initialSpaces)
  const [spaceToDelete, setSpaceToDelete] = useState<Space | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const ids = useMemo(() => draftSpaces.map((space) => space.id), [draftSpaces])
  const visibleRows = Math.min(draftSpaces.length, 6)
  const listHeight = visibleRows > 0 ? visibleRows * 44 + (visibleRows - 1) * 12 : 44

  useEffect(() => {
    setDraftSpaces(initialSpaces)
  }, [initialSpaces])

  const canDelete = draftSpaces.length > 1
  const canSave =
    draftSpaces.length !== initialSpaces.length ||
    draftSpaces.some((space, index) => space.id !== initialSpaces[index]?.id)

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null

    if (!overId || activeId === overId) {
      return
    }

    const oldIndex = draftSpaces.findIndex((space) => space.id === activeId)
    const newIndex = draftSpaces.findIndex((space) => space.id === overId)

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return
    }

    setDraftSpaces((current) => arrayMove(current, oldIndex, newIndex))
  }

  function handleDeleteSpace(spaceId: string) {
    if (!canDelete) {
      return
    }

    setDraftSpaces((current) => current.filter((space) => space.id !== spaceId))
    setSpaceToDelete(null)
  }

  function requestDeleteSpace(space: Space) {
    if (!canDelete) {
      return
    }

    setSpaceToDelete(space)
  }

  function handleSave() {
    if (!canSave) {
      return
    }

    onSave(draftSpaces)
  }

  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      {...getModalBackdropAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
    >
      <motion.section
        className="add-url-modal edit-spaces-modal"
        aria-label="Изменить порядок пространств"
        {...getCenteredModalAnimation(shouldReduceMotion)}
        transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
      >
        <div className="modal-header">
          <h2>Изменить порядок пространств</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="edit-spaces-list" style={{ height: `${listHeight}px` }}>
              {draftSpaces.map((space) => (
                <SortableSpaceRow
                  key={space.id}
                  space={space}
                  canDelete={canDelete}
                  onDelete={() => requestDeleteSpace(space)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="modal-actions edit-spaces-actions">
          <button className="modal-button modal-button-secondary" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="modal-button modal-button-primary" type="button" disabled={!canSave} onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </motion.section>
      <DeleteSpaceModal
        isOpen={Boolean(spaceToDelete)}
        title={spaceToDelete?.title ?? ''}
        onCancel={() => setSpaceToDelete(null)}
        onConfirm={() => {
          if (spaceToDelete) {
            handleDeleteSpace(spaceToDelete.id)
          }
        }}
      />
    </motion.div>
  )
}

interface SortableSpaceRowProps {
  space: Space
  canDelete: boolean
  onDelete: () => void
}

function SortableSpaceRow({ space, canDelete, onDelete }: SortableSpaceRowProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: space.id,
  })

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'edit-space-row is-dragging' : 'edit-space-row'}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        className="edit-space-handle"
        type="button"
        aria-label={`Переместить пространство ${space.title}`}
        {...attributes}
        {...listeners}
      >
        <DotsSixVertical size={14} weight="bold" />
      </button>
      <span className="edit-space-title">{space.title}</span>
      <button
        className="edit-space-delete"
        type="button"
        aria-label={`Удалить пространство ${space.title}`}
        disabled={!canDelete}
        onClick={onDelete}
      >
        <Trash size={14} weight="fill" />
      </button>
    </div>
  )
}
