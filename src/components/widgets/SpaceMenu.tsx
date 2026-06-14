import { motion } from 'framer-motion'
import { FolderPlus, Image, Link, Trash } from '@phosphor-icons/react'
import './ContextMenu.css'

interface SpaceMenuProps {
  x: number
  y: number
  canDeleteSpace: boolean
  onAddUrl: () => void
  onCreateFolder: () => void
  onChangeBackground: () => void
  onDeleteSpace: () => void
}

export function SpaceMenu({
  x,
  y,
  canDeleteSpace,
  onAddUrl,
  onCreateFolder,
  onChangeBackground,
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
    </motion.div>
  )
}
