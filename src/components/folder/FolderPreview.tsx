import { motion } from 'framer-motion'
import type { UrlTile } from '../../types/space'
import { getTextIconDataUrl, getUrlTileDisplayIcon } from '../../lib/urlTile'
import { StableIconImage } from '../ui/StableIconImage'
import './FolderPreview.css'

interface FolderPreviewProps {
  items: UrlTile[]
  layoutId: string
}

export function FolderPreview({ items, layoutId }: FolderPreviewProps) {
  const isThreeByThree = items.length > 4
  const previewItems = isThreeByThree ? items.slice(0, 9) : items.slice(0, 4)
  const previewModeClass = isThreeByThree ? 'folder-preview-nine' : 'folder-preview-four'

  return (
    <span className={`folder-preview ${previewModeClass}`} aria-hidden="true">
      <motion.span
        className="folder-preview-surface"
        layoutId={layoutId}
        transition={{ layout: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] } }}
      />
      {previewItems.map((item) => {
        const icon = getUrlTileDisplayIcon(item)
        const textIconDataUrl = icon.type === 'text' ? getTextIconDataUrl(icon.value) : null

        return (
          <span
            className="folder-preview-icon"
            key={item.id}
            style={{ '--preview-accent': item.accent } as React.CSSProperties}
          >
            {icon.type === 'image' ? (
              <StableIconImage
                className={icon.isAppIcon ? 'folder-preview-image folder-preview-image-app' : 'folder-preview-image'}
                src={icon.value}
                alt=""
                loading="eager"
                decoding="async"
                fetchPriority="auto"
                onLoad={() => {
                  if (!import.meta.env.DEV) {
                    return
                  }

                  console.log('[folder-icon] onLoad', item.id, icon.value)
                }}
              />
            ) : (
              <StableIconImage
                className="folder-preview-text-image"
                src={textIconDataUrl ?? ''}
                alt=""
                loading="eager"
                decoding="async"
              />
            )}
          </span>
        )
      })}
    </span>
  )
}
