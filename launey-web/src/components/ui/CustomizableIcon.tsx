import { type CSSProperties, useId } from 'react'
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
  effectScale?: number
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
  effectScale = 1,
}: CustomizableIconProps) {
  const maskClipId = useId()
  const edgeGradientId = useId()
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
          '--icon-edge-thickness': normalized
            ? `${Math.max(0.5, normalized.edgeThickness * effectScale)}px`
            : `${Math.max(0.5, 2 * effectScale)}px`,
          '--icon-mask-clip': `url(#${maskClipId})`,
        } as CSSProperties
      }
    >
      <svg className="customizable-icon-definitions" aria-hidden="true">
        <defs>
          <clipPath id={maskClipId} clipPathUnits="objectBoundingBox">
            <path d="M .5 0 C .96 0 1 .04 1 .5 C 1 .96 .96 1 .5 1 C .04 1 0 .96 0 .5 C 0 .04 .04 0 .5 0 Z" />
          </clipPath>
        </defs>
      </svg>
      <span className="customizable-icon-surface">
        <span className="customizable-icon-volume" aria-hidden="true" />
        <span className="customizable-icon-image-mask">
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
      </span>
      {shouldShowInlineBorder ? (
        <svg
          className="customizable-icon-mask-border"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={edgeGradientId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop className="customizable-icon-edge-start" offset="0" />
              <stop className="customizable-icon-edge-mid" offset="0.5" />
              <stop className="customizable-icon-edge-end" offset="1" />
            </linearGradient>
          </defs>
          <path
            d="M 50 0 C 96 0 100 4 100 50 C 100 96 96 100 50 100 C 4 100 0 96 0 50 C 0 4 4 0 50 0 Z"
            fill="none"
            stroke={`url(#${edgeGradientId})`}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
    </span>
  )
}
