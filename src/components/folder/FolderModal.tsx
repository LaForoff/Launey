import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DotsThreeOutline, X } from '@phosphor-icons/react'
import { UrlTile } from '../tiles/UrlTile'
import type { FolderTile, UrlTile as UrlTileType } from '../../types/space'
import { ModalPortal } from '../widgets/ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  folderItemVariants,
  folderItemsContainerVariants,
  getFolderBackdropAnimation,
} from '../widgets/modalMotion'
import './FolderModal.css'

interface FolderModalProps {
  folder: FolderTile | null
  isOpen: boolean
  onClose: () => void
  onExitComplete: () => void
  onSurfaceClick?: () => void
  onOpenMenu: (folder: FolderTile, rect: DOMRect) => void
  onUrlContextMenu: (tile: UrlTileType, x: number, y: number) => void
}

export function FolderModal({
  folder,
  isOpen,
  onClose,
  onExitComplete,
  onSurfaceClick,
  onOpenMenu,
  onUrlContextMenu,
}: FolderModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

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

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {isOpen && folder ? (
        <ModalPortal>
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
              className="folder-modal"
              aria-labelledby="folder-modal-title"
              layoutId={shouldReduceMotion ? undefined : `folder-surface-${folder.id}`}
              initial={shouldReduceMotion ? { opacity: 0 } : undefined}
              animate={{ opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : undefined}
              transition={{
                duration: shouldReduceMotion ? 0.18 : MODAL_DURATION,
                ease: MODAL_EASE,
                layout: { duration: 0.32, ease: MODAL_EASE },
              }}
              onClick={(event) => {
                event.stopPropagation()
                onSurfaceClick?.()
              }}
            >
            <div className="modal-header folder-modal-header">
              <div className="folder-modal-title-group">
                <h2 id="folder-modal-title">{folder.title}</h2>
                <button
                  className="folder-modal-menu-trigger"
                  type="button"
                  aria-label="Открыть меню папки"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenMenu(folder, event.currentTarget.getBoundingClientRect())
                  }}
                >
                  <DotsThreeOutline size={18} weight="fill" />
                </button>
              </div>
              <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="folder-modal-content">
              <motion.div
                className="folder-modal-grid"
                variants={folderItemsContainerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                {folder.items.map((item) => (
                  <motion.div key={item.id} variants={folderItemVariants}>
                    <UrlTile tile={item} onContextMenu={onUrlContextMenu} />
                  </motion.div>
                ))}
              </motion.div>
            </div>
            </motion.section>
          </motion.div>
        </ModalPortal>
      ) : null}
    </AnimatePresence>
  )
}
