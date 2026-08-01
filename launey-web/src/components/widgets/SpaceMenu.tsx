import { motion } from 'framer-motion'
import { FolderPlus, Image, Info, Link, Trash } from '@phosphor-icons/react'
import { FEATURE_FLAGS } from '../../config/buildInfo'
import './ContextMenu.css'

interface SpaceMenuProps {
  x: number
  y: number
  canDeleteSpace: boolean
  showDeleteSpace?: boolean
  onAddUrl: () => void
  onCreateFolder: () => void
  onChangeBackground: () => void
  onOpenWhatsNew?: () => void
  onDeleteSpace: () => void
}

export function SpaceMenu({
  x,
  y,
  canDeleteSpace,
  showDeleteSpace = true,
  onAddUrl,
  onCreateFolder,
  onChangeBackground,
  onOpenWhatsNew,
  onDeleteSpace,
}: SpaceMenuProps) {
  return (
    <motion.div
      className="context-menu context-menu-panel"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="context-menu-item" type="button" onClick={onAddUrl}>
        <span className="context-menu-icon">
          <Link size={13} weight="bold" />
        </span>
        Добавить URL
      </button>
      <button className="context-menu-item" type="button" onClick={onCreateFolder}>
        <span className="context-menu-icon">
          <FolderPlus size={13} weight="fill" />
        </span>
        Создать папку
      </button>
      <button className="context-menu-item" type="button" onClick={onChangeBackground}>
        <span className="context-menu-icon">
          <Image size={13} weight="fill" />
        </span>
        Изменить фон
      </button>
      {FEATURE_FLAGS.showWhatsNewMenuItem && onOpenWhatsNew ? (
        <button className="context-menu-item" type="button" onClick={onOpenWhatsNew}>
          <span className="context-menu-icon">
            <Info size={13} weight="fill" />
          </span>
          Что нового
        </button>
      ) : null}
      {showDeleteSpace ? (
        <>
          <div className="context-menu-separator" />
          <button
            className="context-menu-item context-menu-item-danger"
            type="button"
            disabled={!canDeleteSpace}
            onClick={onDeleteSpace}
          >
            <span className="context-menu-icon">
              <Trash size={13} weight="fill" />
            </span>
            Удалить
          </button>
        </>
      ) : null}
    </motion.div>
  )
}
