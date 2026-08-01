import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DotsThreeOutline, X } from '@phosphor-icons/react'
import { UrlTile } from '../tiles/UrlTile'
import { GlowSwap } from '../ui/GlowSwap'
import type { FolderTile, UrlTile as UrlTileType } from '../../types/space'
import { ModalPortal } from '../widgets/ModalPortal'
import {
  MODAL_EASE,
  folderItemVariants,
  folderItemsContainerVariants,
  getFolderBackdropAnimation,
} from '../widgets/modalMotion'
import './FolderModal.css'

interface FolderModalProps {
  folder: FolderTile | null
  isOpen: boolean
  sourceRect: { left: number; top: number; width: number; height: number } | null
  onClose: () => void
  onExitComplete: () => void
  onSurfaceClick?: () => void
  onOpenMenu: (folder: FolderTile, rect: DOMRect) => void
  onUrlContextMenu: (tile: UrlTileType, x: number, y: number) => void
  onDeleteItem: (tile: UrlTileType) => void
  onReorderItems: (items: UrlTileType[]) => void
  isEditMode: boolean
  onEditModeChange: (isEditing: boolean) => void
  exitingTileIds?: Set<string>
}

export function FolderModal({
  folder,
  isOpen,
  sourceRect,
  onClose,
  onExitComplete,
  onSurfaceClick,
  onOpenMenu,
  onUrlContextMenu,
  onDeleteItem,
  onReorderItems,
  isEditMode,
  onEditModeChange,
  exitingTileIds,
}: FolderModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const sortableIds = useMemo(() => folder?.items.map((item) => item.id) ?? [], [folder?.items])
  const sourceTransform = getFolderSourceTransform(sourceRect)

  useEffect(() => {
    if (!isOpen) {
      setActiveDragId(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)

    if (!folder || !isEditMode || !event.over) {
      return
    }

    const activeId = String(event.active.id)
    const overId = String(event.over.id)

    if (activeId === overId) {
      return
    }

    const oldIndex = folder.items.findIndex((item) => item.id === activeId)
    const newIndex = folder.items.findIndex((item) => item.id === overId)

    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    onReorderItems(arrayMove(folder.items, oldIndex, newIndex))
  }

  return (
    <ModalPortal>
      <AnimatePresence onExitComplete={onExitComplete}>
        {isOpen && folder ? (
          <motion.div
            className="modal-backdrop folder-modal-backdrop"
            role="presentation"
            {...getFolderBackdropAnimation(shouldReduceMotion)}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                onClose()
              }
            }}
          >
            <motion.section
              className="folder-modal-shell"
              aria-labelledby="folder-modal-title"
              initial={shouldReduceMotion ? { opacity: 0 } : sourceTransform}
              animate={{ opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 }}
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : {
                      ...sourceTransform,
                      opacity: 0.72,
                      transition: { duration: 0.32, ease: MODAL_EASE },
                    }
              }
              transition={
                shouldReduceMotion
                  ? { duration: 0.16, ease: MODAL_EASE }
                  : {
                      x: { type: 'spring', stiffness: 340, damping: 34, mass: 0.82 },
                      y: { type: 'spring', stiffness: 340, damping: 34, mass: 0.82 },
                      scaleX: { type: 'spring', stiffness: 340, damping: 34, mass: 0.82 },
                      scaleY: { type: 'spring', stiffness: 340, damping: 34, mass: 0.82 },
                      opacity: { duration: 0.18, ease: MODAL_EASE },
                    }
              }
              onClick={(event) => {
                event.stopPropagation()
                onSurfaceClick?.()
              }}
            >
            <motion.div
              className="folder-modal"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: shouldReduceMotion ? 0.12 : 0.18,
                ease: MODAL_EASE,
              }}
            />
            <motion.div
              className="modal-header folder-modal-header"
              initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.08, duration: shouldReduceMotion ? 0.08 : 0.16 }}
            >
              <motion.div className="folder-modal-title-group" layout>
                <h2 id="folder-modal-title">{folder.title}</h2>
                <AnimatePresence initial={false} mode="popLayout">
                  {!isEditMode ? (
                    <motion.button
                      key="folder-menu"
                      layout
                      className="space-settings-button"
                      type="button"
                      aria-label="Открыть меню папки"
                      initial={{
                        opacity: 0,
                        scale: 0.82,
                        filter: 'blur(10px) drop-shadow(0 0 16px rgba(255, 255, 255, 0.12))',
                      }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        filter: 'blur(0px) drop-shadow(0 0 0 rgba(255, 255, 255, 0))',
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0.82,
                        filter: 'blur(10px) drop-shadow(0 0 16px rgba(255, 255, 255, 0.12))',
                      }}
                      transition={{ duration: 0.24, ease: MODAL_EASE }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenMenu(folder, event.currentTarget.getBoundingClientRect())
                      }}
                    >
                      <DotsThreeOutline size={16} weight="fill" />
                    </motion.button>
                  ) : (
                    <motion.button
                      key="folder-save"
                      layout
                      className="space-edit-button is-active"
                      type="button"
                      initial={{
                        opacity: 0,
                        scale: 0.94,
                        filter: 'blur(10px) drop-shadow(0 0 16px rgba(255, 255, 255, 0.12))',
                      }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        filter: 'blur(0px) drop-shadow(0 0 0 rgba(255, 255, 255, 0))',
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0.94,
                        filter: 'blur(10px) drop-shadow(0 0 16px rgba(255, 255, 255, 0.12))',
                      }}
                      transition={{ duration: 0.24, ease: MODAL_EASE }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEditModeChange(false)
                      }}
                    >
                      <GlowSwap
                        as="span"
                        swapKey="folder-save"
                        className="space-edit-label"
                        intensity="strong"
                        presenceMode="popLayout"
                      >
                        Сохранить
                      </GlowSwap>
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
              <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
                <X size={18} weight="bold" />
              </button>
            </motion.div>

            <motion.div
              className="folder-modal-content"
              initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.1, duration: shouldReduceMotion ? 0.08 : 0.18 }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(event) => setActiveDragId(String(event.active.id))}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragId(null)}
              >
                <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                  <motion.div
                    className="folder-modal-grid"
                    variants={folderItemsContainerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    {folder.items.map((item) => (
                      <SortableFolderItem
                        key={item.id}
                        item={item}
                        isEditMode={isEditMode}
                        isDragging={activeDragId === item.id}
                        isExiting={Boolean(exitingTileIds?.has(item.id))}
                        onContextMenu={onUrlContextMenu}
                        onDelete={() => onDeleteItem(item)}
                      />
                    ))}
                  </motion.div>
                </SortableContext>
              </DndContext>
            </motion.div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}

function getFolderSourceTransform(
  sourceRect: { left: number; top: number; width: number; height: number } | null,
) {
  if (!sourceRect || typeof window === 'undefined') {
    return { opacity: 0, x: 0, y: 12, scaleX: 0.94, scaleY: 0.94 }
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  let targetWidth = Math.min(600, viewportWidth - 40)
  let targetHeight = Math.min(650, viewportHeight - 48)

  if (viewportWidth <= 620) {
    targetWidth = Math.min(409, viewportWidth - 32)
    targetHeight = Math.min(520, viewportHeight - 32)
  }

  if (viewportWidth <= 480) {
    targetWidth = Math.min(313, viewportWidth - 24)
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2

  return {
    opacity: 0.72,
    x: sourceCenterX - viewportWidth / 2,
    y: sourceCenterY - viewportHeight / 2,
    scaleX: Math.max(0.08, sourceRect.width / targetWidth),
    scaleY: Math.max(0.08, sourceRect.height / targetHeight),
  }
}

interface SortableFolderItemProps {
  item: UrlTileType
  isEditMode: boolean
  isDragging: boolean
  isExiting: boolean
  onContextMenu: (tile: UrlTileType, x: number, y: number) => void
  onDelete: () => void
}

function SortableFolderItem({
  item,
  isEditMode,
  isDragging,
  isExiting,
  onContextMenu,
  onDelete,
}: SortableFolderItemProps) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: item.id,
    disabled: !isEditMode || isExiting,
  })

  return (
    <motion.div layout="position" variants={folderItemVariants} transition={{ duration: 0.22, ease: MODAL_EASE }}>
      <UrlTile
        tile={item}
        onContextMenu={onContextMenu}
        setDraggableNodeRef={setNodeRef}
        draggableAttributes={attributes}
        draggableListeners={listeners}
        dragStyle={{
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 15 : undefined,
        }}
        isDragging={isDragging}
        isExiting={isExiting}
        isJiggleMode={isEditMode && !isDragging}
        suppressClick={isEditMode}
        disableNavigation={isEditMode}
        showDeleteBubble={isEditMode}
        onDeleteRequest={onDelete}
      />
    </motion.div>
  )
}
