import { useEffect, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { X } from '@phosphor-icons/react'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { FolderPreview } from '../folder/FolderPreview'
import type { FolderTile as FolderTileType } from '../../types/space'
import './FolderTile.css'

interface FolderTileProps {
  tile: FolderTileType
  onOpen: (tile: FolderTileType) => void
  onContextMenu: (tile: FolderTileType, x: number, y: number) => void
  draggableAttributes?: DraggableAttributes
  draggableListeners?: SyntheticListenerMap
  setDraggableNodeRef?: (element: HTMLButtonElement | null) => void
  dragStyle?: CSSProperties
  isDragging?: boolean
  isExiting?: boolean
  isJiggleMode?: boolean
  jiggleDelayMs?: number
  suppressClick?: boolean
  isNewlyCreated?: boolean
  showDeleteBubble?: boolean
  onDeleteRequest?: () => void
}

export function FolderTile({
  tile,
  onOpen,
  onContextMenu,
  draggableAttributes,
  draggableListeners,
  setDraggableNodeRef,
  dragStyle,
  isDragging = false,
  isExiting = false,
  isJiggleMode = false,
  jiggleDelayMs = 0,
  suppressClick = false,
  isNewlyCreated = false,
  showDeleteBubble = false,
  onDeleteRequest,
}: FolderTileProps) {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    console.log('[folder-tile] mount', tile.id)

    return () => {
      console.log('[folder-tile] unmount', tile.id)
    }
  }, [tile.id])

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (suppressClick || isExiting) {
      event.preventDefault()
      return
    }

    onOpen(tile)
  }

  function handleContextMenu(event: MouseEvent<HTMLButtonElement>) {
    if (isExiting) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    onContextMenu(tile, event.clientX, event.clientY)
  }

  function handleDeleteBubblePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
  }

  function handleDeleteBubbleClick(event: MouseEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.stopPropagation()
    onDeleteRequest?.()
  }

  function handleDeleteBubbleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onDeleteRequest?.()
  }

  return (
    <button
      ref={setDraggableNodeRef}
      className={[
        'tile',
        'folder-tile',
        isExiting ? 'tile-exiting' : '',
        isNewlyCreated ? 'folder-tile-created' : '',
        isDragging ? 'tile-dragging' : '',
        isJiggleMode && !isDragging ? 'tile-jiggle' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      type="button"
      style={
        {
          '--tile-accent': tile.accent,
          '--jiggle-delay': `${jiggleDelayMs}ms`,
          ...dragStyle,
        } as React.CSSProperties
      }
      {...draggableAttributes}
      {...draggableListeners}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {showDeleteBubble ? (
        <span
          className="tile-delete-bubble"
          role="button"
          tabIndex={0}
          aria-label={`Удалить ${tile.title}`}
          onPointerDown={handleDeleteBubblePointerDown}
          onClick={handleDeleteBubbleClick}
          onKeyDown={handleDeleteBubbleKeyDown}
        >
          <span className="tile-delete-bubble-dot">
            <X size={14} weight="bold" />
          </span>
        </span>
      ) : null}
      <FolderPreview items={tile.items} layoutId={`folder-surface-${tile.id}`} />
      <span className="tile-title" title={tile.title}>
        {tile.title}
      </span>
    </button>
  )
}
