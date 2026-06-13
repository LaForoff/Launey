import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ArrowsLeftRight, CaretRight, NotePencil, Trash } from '@phosphor-icons/react'
import type { Space } from '../../types/space'
import './ContextMenu.css'

interface FolderContextMenuProps {
  x: number
  y: number
  spaces: Space[]
  activeSpaceId: string
  onEdit: () => void
  onMoveToSpace: (spaceId: string) => void
  onDelete: () => void
}

export function FolderContextMenu({
  x,
  y,
  spaces,
  activeSpaceId,
  onEdit,
  onMoveToSpace,
  onDelete,
}: FolderContextMenuProps) {
  const moveButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const [submenuPosition, setSubmenuPosition] = useState<{ left: number; top: number } | null>(null)

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const openSubmenu = () => {
    clearCloseTimer()
    const rect = moveButtonRef.current?.getBoundingClientRect()

    if (!rect) {
      return
    }

    setSubmenuPosition({
      left: rect.right + 2,
      top: rect.top - 6,
    })
  }

  const scheduleCloseSubmenu = () => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setSubmenuPosition(null)
      closeTimerRef.current = null
    }, 120)
  }

  return createPortal(
    <motion.div
      className="context-menu context-menu-panel url-context-menu"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="context-menu-item" type="button" onClick={onEdit}>
        <span className="context-menu-item-content">
          <span className="context-menu-icon">
            <NotePencil size={13} weight="fill" />
          </span>
          Изменить
        </span>
      </button>
      <div
        className="context-menu-submenu-wrap"
        onMouseEnter={openSubmenu}
        onMouseLeave={scheduleCloseSubmenu}
        onFocus={openSubmenu}
        onBlur={scheduleCloseSubmenu}
      >
        <button ref={moveButtonRef} className="context-menu-item" type="button">
          <span className="context-menu-item-content">
            <span className="context-menu-icon">
              <ArrowsLeftRight size={13} weight="bold" />
            </span>
            Переместить в
          </span>
          <span className="context-menu-item-arrow" aria-hidden="true">
            <CaretRight size={12} weight="bold" />
          </span>
        </button>
      </div>
      {submenuPosition
        ? createPortal(
            <div
              className="context-menu context-menu-panel context-menu-submenu"
              style={{ left: submenuPosition.left, top: submenuPosition.top }}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleCloseSubmenu}
            >
              {spaces.map((space) => (
                <button
                  key={space.id}
                  className="context-menu-item"
                  type="button"
                  onClick={() => onMoveToSpace(space.id)}
                  disabled={space.id === activeSpaceId}
                >
                  {space.title}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
      <div className="context-menu-separator" />
      <button className="context-menu-item context-menu-item-danger" type="button" onClick={onDelete}>
        <span className="context-menu-item-content">
          <span className="context-menu-icon">
            <Trash size={13} weight="fill" />
          </span>
          Удалить
        </span>
      </button>
    </motion.div>,
    document.body,
  )
}
