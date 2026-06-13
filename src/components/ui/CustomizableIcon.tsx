import type { CSSProperties } from 'react'
import type { IconCustomization } from '../../types/space'
import { normalizeIconCustomization } from '../../lib/iconCustomization'
import { StableIconImage } from './StableIconImage'
import './CustomizableIcon.css'

interface CustomizableIconProps {
  src: string
  customization?: IconCustomization
  showInlineBorder?: boolean
  className?: string
  imageClassName?: string
  contentFit?: 'contain' | 'cover'
  alt?: string
  loading?: 'eager' | 'lazy'
  decoding?: 'sync' | 'async' | 'auto'
  fetchPriority?: 'high' | 'low' | 'auto'
  onLoad?: () => void
}

export function CustomizableIcon({
  src,
  customization,
  showInlineBorder = true,
  className,
  imageClassName,
  contentFit = 'contain',
  alt = '',
  loading,
  decoding,
  fetchPriority,
  onLoad,
}: CustomizableIconProps) {
  const normalized = customization ? normalizeIconCustomization(customization) : null
  const edgeOpacityScale = normalized ? normalized.edgeAlpha / 100 : 0
  const shouldShowInlineBorder = Boolean(normalized && showInlineBorder && normalized.edgeAlpha > 0)

  return (
    <span
      className={[
        'customizable-icon',
        normalized ? 'has-custom-effects' : '',
        normalized?.hasBackground ? 'has-custom-background' : '',
        normalized?.volumePlacement === 'below' ? 'volume-below-image' : '',
        normalized?.volumePlacement === 'above' ? 'volume-above-image' : '',
        shouldShowInlineBorder ? 'has-inline-border' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--icon-custom-scale': normalized ? normalized.scale / 100 : 1,
          '--icon-custom-background': normalized?.backgroundColor,
          '--icon-volume-alpha': normalized ? normalized.volumeAlpha / 100 : 0,
          '--icon-edge-alpha-start': 0.64 * edgeOpacityScale,
          '--icon-edge-alpha-mid': 0.08 * edgeOpacityScale,
          '--icon-edge-alpha-end': 0.64 * edgeOpacityScale,
          '--icon-edge-thickness': normalized ? `${normalized.edgeThickness}px` : '2px',
        } as CSSProperties
      }
    >
      <span className="customizable-icon-volume" aria-hidden="true" />
      <StableIconImage
        className={['customizable-icon-image', imageClassName ?? ''].filter(Boolean).join(' ')}
        style={{ objectFit: contentFit }}
        src={src}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onLoad={onLoad}
      />
    </span>
  )
}
