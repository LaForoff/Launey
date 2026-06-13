import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from '@phosphor-icons/react'
import { FolderTile } from './FolderTile'
import { UrlTile } from './UrlTile'
import type { FolderTile as FolderTileType, Tile } from '../../types/space'
import './TileGrid.css'

interface TileGridProps {
  tiles: Tile[]
  onAddUrl: () => void
  onUrlContextMenu: (tile: Extract<Tile, { kind: 'url' }>, x: number, y: number) => void
  onFolderContextMenu: (tile: FolderTileType, x: number, y: number) => void
  onOpenFolder: (tile: FolderTileType) => void
  onDeleteUrl: (tile: Extract<Tile, { kind: 'url' }>) => void
  onDeleteFolder: (tile: FolderTileType) => void
  onReorderTiles: (nextTiles: Tile[]) => void
  isSortableEnabled: boolean
  isEditMode?: boolean
  onTileDragStateChange?: (isDragging: boolean) => void
  exitingTileIds?: Set<string>
  highlightedFolderId?: string | null
}

export function TileGrid({
  tiles,
  onAddUrl,
  onUrlContextMenu,
  onFolderContextMenu,
  onOpenFolder,
  onDeleteUrl,
  onDeleteFolder,
  onReorderTiles,
  isSortableEnabled,
  isEditMode = false,
  onTileDragStateChange,
  exitingTileIds,
  highlightedFolderId = null,
}: TileGridProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [isJiggleMode, setIsJiggleMode] = useState(false)
  const [suppressClick, setSuppressClick] = useState(false)
  const jiggleOffTimerRef = useRef<number | null>(null)
  const suppressClickTimerRef = useRef<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  const sortableIds = useMemo(() => tiles.map((tile) => tile.id), [tiles])

  useEffect(() => {
    return () => {
      if (jiggleOffTimerRef.current) {
        window.clearTimeout(jiggleOffTimerRef.current)
      }

      if (suppressClickTimerRef.current) {
        window.clearTimeout(suppressClickTimerRef.current)
      }
    }
  }, [])

  function releaseJiggleWithDelay() {
    if (jiggleOffTimerRef.current) {
      window.clearTimeout(jiggleOffTimerRef.current)
    }

    jiggleOffTimerRef.current = window.setTimeout(() => {
      setIsJiggleMode(false)
      jiggleOffTimerRef.current = null
    }, 420)
  }

  function setSuppressClickTemporarily(durationMs: number) {
    setSuppressClick(true)

    if (suppressClickTimerRef.current) {
      window.clearTimeout(suppressClickTimerRef.current)
    }

    suppressClickTimerRef.current = window.setTimeout(() => {
      setSuppressClick(false)
      suppressClickTimerRef.current = null
    }, durationMs)
  }

  function handleDragStart(event: DragStartEvent) {
    if (!isSortableEnabled) {
      return
    }

    setActiveDragId(String(event.active.id))
    setIsJiggleMode(true)
    setSuppressClick(true)
    if (suppressClickTimerRef.current) {
      window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = null
    }
    onTileDragStateChange?.(true)
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!isSortableEnabled) {
      return
    }

    const activeId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null
    setActiveDragId(null)
    releaseJiggleWithDelay()
    setSuppressClickTemporarily(1000)
    onTileDragStateChange?.(false)

    if (!overId || activeId === overId) {
      return
    }

    const oldIndex = tiles.findIndex((tile) => tile.id === activeId)
    const newIndex = tiles.findIndex((tile) => tile.id === overId)

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return
    }

    setSuppressClickTemporarily(1000)
    onReorderTiles(arrayMove(tiles, oldIndex, newIndex))
  }

  function handleDragCancel() {
    if (!isSortableEnabled) {
      return
    }

    setActiveDragId(null)
    releaseJiggleWithDelay()
    setSuppressClickTemporarily(1000)
    onTileDragStateChange?.(false)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className={tiles.length === 0 ? 'tile-grid-shell is-empty' : 'tile-grid-shell'}>
          {tiles.length === 0 ? (
            <section className="empty-space-state" aria-label="Пустое пространство">
              <div className="empty-space-state__glow empty-space-state__glow--violet" aria-hidden="true" />
              <div className="empty-space-state__glow empty-space-state__glow--blue" aria-hidden="true" />
              <div className="empty-space-state__glow empty-space-state__glow--bottom" aria-hidden="true" />
              <div className="empty-space-state__icon-button" aria-hidden="true">
                <Plus size={18} weight="regular" />
              </div>
              <div className="empty-space-state__content">
                <h2>Эх, пространство пустует...</h2>
                <p>Хотите добавить первую ссылку?</p>
              </div>
              <button className="empty-space-state__cta" type="button" onClick={onAddUrl}>
                <Plus size={13} weight="bold" />
                <span>Добавить</span>
              </button>
            </section>
          ) : null}
          <div className={tiles.length === 0 ? 'tile-grid is-hidden' : 'tile-grid'}>
          {tiles.map((tile) => (
            <SortableTileItem
              key={tile.id}
              tile={tile}
              isSortableEnabled={isSortableEnabled}
              isDragging={activeDragId === tile.id}
              isExiting={Boolean(exitingTileIds?.has(tile.id))}
              isJiggleMode={isEditMode || isJiggleMode}
              suppressClick={isEditMode || suppressClick}
              disableUrlNavigation={isEditMode}
              showDeleteBubble={isEditMode}
              onDeleteRequest={tile.kind === 'folder' ? () => onDeleteFolder(tile) : () => onDeleteUrl(tile)}
              isNewlyCreatedFolder={tile.kind === 'folder' && tile.id === highlightedFolderId}
              onOpenFolder={onOpenFolder}
              onFolderContextMenu={onFolderContextMenu}
              onUrlContextMenu={onUrlContextMenu}
            />
          ))}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  )
}

interface SortableTileItemProps {
  tile: Tile
  isSortableEnabled: boolean
  isDragging: boolean
  isExiting: boolean
  isJiggleMode: boolean
  suppressClick: boolean
  disableUrlNavigation: boolean
  showDeleteBubble: boolean
  onDeleteRequest: () => void
  isNewlyCreatedFolder: boolean
  onUrlContextMenu: (tile: Extract<Tile, { kind: 'url' }>, x: number, y: number) => void
  onFolderContextMenu: (tile: FolderTileType, x: number, y: number) => void
  onOpenFolder: (tile: FolderTileType) => void
}

function SortableTileItem({
  tile,
  isSortableEnabled,
  isDragging,
  isExiting,
  isJiggleMode,
  suppressClick,
  disableUrlNavigation,
  showDeleteBubble,
  onDeleteRequest,
  isNewlyCreatedFolder,
  onUrlContextMenu,
  onFolderContextMenu,
  onOpenFolder,
}: SortableTileItemProps) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: tile.id,
    disabled: !isSortableEnabled || isExiting,
  })
  const jiggleDelayMs = getJiggleDelay(tile.id)
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 15 : undefined,
  }

  if (tile.kind === 'folder') {
    return (
      <FolderTile
        tile={tile}
        onOpen={onOpenFolder}
        onContextMenu={onFolderContextMenu}
        setDraggableNodeRef={setNodeRef}
        draggableAttributes={attributes}
        draggableListeners={listeners}
        dragStyle={dragStyle}
        isDragging={isDragging}
        isExiting={isExiting}
        isJiggleMode={isJiggleMode}
        jiggleDelayMs={jiggleDelayMs}
        suppressClick={suppressClick}
        showDeleteBubble={showDeleteBubble}
        onDeleteRequest={onDeleteRequest}
        isNewlyCreated={isNewlyCreatedFolder}
      />
    )
  }

  return (
    <UrlTile
      tile={tile}
      onContextMenu={onUrlContextMenu}
      setDraggableNodeRef={setNodeRef}
      draggableAttributes={attributes}
      draggableListeners={listeners}
      dragStyle={dragStyle}
      isDragging={isDragging}
      isExiting={isExiting}
      isJiggleMode={isJiggleMode}
      jiggleDelayMs={jiggleDelayMs}
      suppressClick={suppressClick}
      disableNavigation={disableUrlNavigation}
      showDeleteBubble={showDeleteBubble}
      onDeleteRequest={onDeleteRequest}
    />
  )
}

function getJiggleDelay(id: string) {
  let hash = 0

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash) % 120
}
