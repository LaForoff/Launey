import type { UrlTile } from '../../types/space'
import { getTextIconDataUrl, getUrlTileDisplayIcon } from '../../lib/urlTile'
import { CustomizableIcon } from '../ui/CustomizableIcon'
import './FolderPreview.css'

interface FolderPreviewProps {
  items: UrlTile[]
}

export function FolderPreview({ items }: FolderPreviewProps) {
  const isThreeByThree = items.length > 4
  const previewItems = isThreeByThree ? items.slice(0, 9) : items.slice(0, 4)
  const previewModeClass = isThreeByThree ? 'folder-preview-nine' : 'folder-preview-four'
  const iconEffectScale = isThreeByThree ? 18 / 86 : 27 / 86

  return (
    <span className={`folder-preview ${previewModeClass}`} aria-hidden="true">
      <span className="folder-preview-surface" />
      {previewItems.map((item) => {
        const icon = getUrlTileDisplayIcon(item)
        const textIconDataUrl = icon.type === 'text' ? getTextIconDataUrl(icon.value) : null

        return (
          <span
            className="folder-preview-icon"
            key={item.id}
            style={{ '--preview-accent': item.accent } as React.CSSProperties}
          >
            <CustomizableIcon
              className="folder-preview-customizable-icon"
              src={icon.type === 'image' ? icon.value : textIconDataUrl ?? ''}
              customization={item.iconCustomization}
              showInlineBorder={item.addFrame !== false}
              contentFit="contain"
              effectScale={iconEffectScale}
              alt=""
              loading="eager"
              decoding="async"
              fetchPriority="auto"
            />
          </span>
        )
      })}
    </span>
  )
}
