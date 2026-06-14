import { useEffect, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { X } from '@phosphor-icons/react'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import type { UrlTile as UrlTileType } from '../../types/space'
import { getTextIconDataUrl, getUrlTileDisplayIcon } from '../../lib/urlTile'
import { CustomizableIcon } from '../ui/CustomizableIcon'
import './UrlTile.css'

interface UrlTileProps {
  tile: UrlTileType
  onContextMenu: (tile: UrlTileType, x: number, y: number) => void
  draggableAttributes?: DraggableAttributes
  draggableListeners?: SyntheticListenerMap
  setDraggableNodeRef?: (element: HTMLElement | null) => void
  dragStyle?: CSSProperties
  isDragging?: boolean
  isExiting?: boolean
  isJiggleMode?: boolean
  jiggleDelayMs?: number
  suppressClick?: boolean
  disableNavigation?: boolean
  showDeleteBubble?: boolean
  onDeleteRequest?: () => void
}

export function UrlTile({
  tile,
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
  disableNavigation = false,
  showDeleteBubble = false,
  onDeleteRequest,
}: UrlTileProps) {
  const icon = getUrlTileDisplayIcon(tile)
  const textIconDataUrl = icon.type === 'text' ? getTextIconDataUrl(icon.value) : null
  const isNavigationBlocked = suppressClick || disableNavigation
  const hasCustomizedIcon = Boolean(tile.iconCustomization)

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    console.log('[tile] mount', tile.id, tile.icon)

    return () => {
      console.log('[tile] unmount', tile.id, tile.icon)
    }
  }, [tile.icon, tile.id])

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isNavigationBlocked || isExiting) {
      event.preventDefault()
    }
  }

  function handleMouseDown(event: MouseEvent<HTMLAnchorElement>) {
    if (isNavigationBlocked || isExiting) {
      event.preventDefault()
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLAnchorElement>) {
    if (isExiting) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    onContextMenu(tile, event.clientX, event.clientY)
  }

  function handleImageLoad() {
    if (!import.meta.env.DEV || icon.type !== 'image') {
      return
    }

    console.log('[icon] onLoad', tile.id, icon.value)
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
    <a
      ref={setDraggableNodeRef}
      className={[
        'tile',
        'url-tile',
        isExiting ? 'tile-exiting' : '',
        isDragging ? 'tile-dragging' : '',
        isJiggleMode && !isDragging ? 'tile-jiggle' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      href={isNavigationBlocked ? undefined : tile.href}
      target={isNavigationBlocked ? undefined : '_blank'}
      rel={isNavigationBlocked ? undefined : 'noreferrer'}
      style={
        {
          '--tile-accent': tile.accent,
          '--jiggle-delay': `${jiggleDelayMs}ms`,
          ...dragStyle,
        } as React.CSSProperties
      }
      {...draggableAttributes}
      {...draggableListeners}
      onMouseDown={handleMouseDown}
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
      <CustomizableIcon
        className={[
          'tile-icon',
          hasCustomizedIcon ? 'tile-icon-customized' : '',
          tile.addFrame === false ? 'tile-icon-no-frame' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        imageClassName={
          hasCustomizedIcon
            ? undefined
            : icon.type === 'image' && icon.isAppIcon
              ? 'tile-icon-image tile-icon-image-app'
              : icon.type === 'image'
                ? 'tile-icon-image'
                : 'tile-icon-text-image'
        }
        contentFit={hasCustomizedIcon || icon.type !== 'image' ? 'contain' : 'cover'}
        src={icon.type === 'image' ? icon.value : textIconDataUrl ?? ''}
        customization={tile.iconCustomization}
        showInlineBorder={tile.addFrame !== false}
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="auto"
        onLoad={handleImageLoad}
      />
      <span className="tile-title" title={tile.title}>
        {tile.title}
      </span>
    </a>
  )
}
