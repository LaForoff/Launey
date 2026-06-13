import { useEffect, useId, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, X } from '@phosphor-icons/react'
import { CustomizableIcon } from '../ui/CustomizableIcon'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import { getTextIconDataUrl, getUrlTileDisplayIcon } from '../../lib/urlTile'
import type { Space, UrlTile } from '../../types/space'
import './AddUrlModal.css'
import './CreateFolderModal.css'

export type FolderSelectionRef =
  | { source: 'space'; spaceId: string; tileId: string }
  | { source: 'folder'; tileId: string }

interface CreateFolderModalProps {
  isOpen: boolean
  mode: 'create' | 'edit'
  spaces: Space[]
  editingFolderTitle?: string
  editingFolderItems?: UrlTile[]
  onClose: () => void
  onSubmit: (payload: { title: string; selectedTiles: FolderSelectionRef[] }) => void
}

export function CreateFolderModal({
  isOpen,
  mode,
  spaces,
  editingFolderTitle,
  editingFolderItems,
  onClose,
  onSubmit,
}: CreateFolderModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <AnimatePresence>
      {isOpen ? (
        <ModalPortal>
          <CreateFolderModalContent
            key={`${mode}-${editingFolderTitle ?? 'new'}`}
            mode={mode}
            spaces={spaces}
            editingFolderTitle={editingFolderTitle}
            editingFolderItems={editingFolderItems ?? []}
            onClose={onClose}
            onSubmit={onSubmit}
            shouldReduceMotion={shouldReduceMotion}
          />
        </ModalPortal>
      ) : null}
    </AnimatePresence>
  )
}

interface CreateFolderModalContentProps {
  mode: 'create' | 'edit'
  spaces: Space[]
  editingFolderTitle?: string
  editingFolderItems: UrlTile[]
  onClose: () => void
  onSubmit: (payload: { title: string; selectedTiles: FolderSelectionRef[] }) => void
  shouldReduceMotion: boolean
}

function CreateFolderModalContent({
  mode,
  spaces,
  editingFolderTitle,
  editingFolderItems,
  onClose,
  onSubmit,
  shouldReduceMotion,
}: CreateFolderModalContentProps) {
  const titleId = useId()
  const defaultTitle = mode === 'edit' ? editingFolderTitle?.trim() || 'Новая папка' : 'Новая папка'
  const initialSelectedIds = useMemo(
    () => (mode === 'edit' ? editingFolderItems.map((tile) => getFolderSelectionKey(tile.id)) : []),
    [editingFolderItems, mode],
  )
  const [title, setTitle] = useState(defaultTitle)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)

  useEffect(() => {
    setTitle(defaultTitle)
    setSelectedIds(initialSelectedIds)
  }, [defaultTitle, initialSelectedIds])

  const selectableSpaces = useMemo(
    () =>
      spaces.map((space) => ({
        ...space,
        selectableTiles: space.tiles.filter((tile): tile is UrlTile => tile.kind === 'url'),
      })),
    [spaces],
  )

  const selectedCount = selectedIds.length
  const canCreate = selectedCount > 0

  function toggleSelection(source: 'space' | 'folder', tileId: string, spaceId?: string) {
    const key = toggleSourceKey(source, tileId, spaceId)

    setSelectedIds((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    )
  }

  function handleSubmit() {
    if (!canCreate) {
      return
    }

    onSubmit({
      title: title.trim() || 'Новая папка',
      selectedTiles: selectedIds.map(parseSelectionKey).filter((entry): entry is FolderSelectionRef => entry !== null),
    })
  }

  const modalTitle = mode === 'edit' ? 'Изменение папки' : 'Создание папки'
  const submitLabel = mode === 'edit' ? 'Сохранить' : 'Создать'

  return (
    <motion.div
      className="modal-backdrop modal-backdrop-strong"
      role="presentation"
      {...getModalBackdropAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
    >
      <motion.section
        className="add-url-modal create-folder-modal"
        aria-labelledby={titleId}
        {...getCenteredModalAnimation(shouldReduceMotion)}
        transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
      >
        <div className="modal-header">
          <h2 id={titleId}>{modalTitle}</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="create-folder-body">
          <input
            className="modal-input create-folder-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Новая папка"
            autoComplete="off"
            autoFocus
          />

          <p className="create-folder-counter">Выбрано приложений: {selectedCount}</p>

          <div className="create-folder-sections">
            {mode === 'edit' && editingFolderItems.length > 0 ? (
              <section className="create-folder-space-card">
                <h3>{editingFolderTitle?.trim() || 'Текущая папка'}</h3>
                <div className="create-folder-grid">
                  {editingFolderItems.map((tile) => {
                    const selectionKey = getFolderSelectionKey(tile.id)
                    const isSelected = selectedIds.includes(selectionKey)

                    return (
                      <SelectableUrlCard
                        key={tile.id}
                        tile={tile}
                        isSelected={isSelected}
                        onToggle={() => toggleSelection('folder', tile.id)}
                      />
                    )
                  })}
                </div>
              </section>
            ) : null}
            {selectableSpaces.map((space) => (
              <section className="create-folder-space-card" key={space.id}>
                <h3>{space.title}</h3>
                {space.selectableTiles.length > 0 ? (
                  <div className="create-folder-grid">
                    {space.selectableTiles.map((tile) => {
                      const selectionKey = getSpaceSelectionKey(space.id, tile.id)
                      const isSelected = selectedIds.includes(selectionKey)

                      return (
                        <SelectableUrlCard
                          key={tile.id}
                          tile={tile}
                          isSelected={isSelected}
                          onToggle={() => toggleSelection('space', tile.id, space.id)}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <p className="create-folder-empty">Нет доступных ярлыков</p>
                )}
              </section>
            ))}
          </div>
        </div>

        <div className="modal-actions create-folder-actions">
          <button className="modal-button modal-button-secondary" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="modal-button modal-button-primary" type="button" disabled={!canCreate} onClick={handleSubmit}>
            {submitLabel}
          </button>
        </div>
      </motion.section>
    </motion.div>
  )
}

interface SelectableUrlCardProps {
  tile: UrlTile
  isSelected: boolean
  onToggle: () => void
}

function SelectableUrlCard({ tile, isSelected, onToggle }: SelectableUrlCardProps) {
  const icon = getUrlTileDisplayIcon(tile)
  const textIconDataUrl = icon.type === 'text' ? getTextIconDataUrl(icon.value) : null
  const hasCustomizedIcon = Boolean(tile.iconCustomization)

  return (
    <button
      className={isSelected ? 'create-folder-tile is-selected' : 'create-folder-tile'}
      type="button"
      onClick={onToggle}
    >
      <span className="create-folder-checkbox" aria-hidden="true">
        <span className="create-folder-checkbox-dot">{isSelected ? <Check size={10} weight="bold" /> : null}</span>
      </span>
      <CustomizableIcon
        className={[
          'tile-icon',
          hasCustomizedIcon ? 'tile-icon-customized' : '',
          tile.addFrame === false ? 'tile-icon-no-frame' : '',
          'create-folder-tile-icon',
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
      />
      <span className="tile-title create-folder-tile-title" title={tile.title}>
        {tile.title}
      </span>
    </button>
  )
}

function toggleSourceKey(source: 'space' | 'folder', tileId: string, spaceId?: string) {
  return source === 'folder' ? getFolderSelectionKey(tileId) : getSpaceSelectionKey(spaceId ?? '', tileId)
}

function getSpaceSelectionKey(spaceId: string, tileId: string) {
  return `space::${spaceId}::${tileId}`
}

function getFolderSelectionKey(tileId: string) {
  return `folder::${tileId}`
}

function parseSelectionKey(value: string): FolderSelectionRef | null {
  if (value.startsWith('folder::')) {
    const tileId = value.slice('folder::'.length)
    return tileId ? { source: 'folder', tileId } : null
  }

  const [source, spaceId, tileId] = value.split('::')
  if (source !== 'space' || !spaceId || !tileId) {
    return null
  }

  return { source: 'space', spaceId, tileId }
}
