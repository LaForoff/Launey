import { useState, type CSSProperties, type SyntheticEvent } from 'react'
import { isCachedIconPath, isLocalUserIconPath } from '../../lib/iconApi'
import { analyzeLoadedIcon, getCachedIconContrast, iconSurfaceForColor, type IconContrast } from '../../lib/iconContrast'
import './AdaptiveIconImage.css'

interface StableIconImageProps {
  src: string
  className: string
  style?: CSSProperties
  alt?: string
  loading?: 'eager' | 'lazy'
  decoding?: 'sync' | 'async' | 'auto'
  fetchPriority?: 'high' | 'low' | 'auto'
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void
  adaptToTheme?: boolean
  surfaceColor?: string
}

export function StableIconImage({
  src,
  className,
  style,
  alt = '',
  loading,
  decoding,
  fetchPriority,
  onLoad,
  onError,
  adaptToTheme = false,
  surfaceColor,
}: StableIconImageProps) {
  const [retry, setRetry] = useState<{ src: string; at: number }>()
  const [analysis, setAnalysis] = useState<{ src: string; value: IconContrast }>()
  const didRetry = retry?.src === src
  const runtimeSrc = didRetry ? `${src}${src.includes('?') ? '&' : '?'}v=${retry.at}` : src
  const contrast = adaptToTheme ? (analysis?.src === src ? analysis.value : getCachedIconContrast(src)) : undefined

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    if (didRetry || (!isCachedIconPath(src) && !isLocalUserIconPath(src))) {
      onError?.(event)
      return
    }

    setRetry({ src, at: Date.now() })
  }

  return (
    <img
      className={[className, adaptToTheme ? 'adaptive-icon-image' : ''].filter(Boolean).join(' ')}
      style={style}
      src={runtimeSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onLoad={(event) => {
        if (adaptToTheme && event.currentTarget.getAttribute('src') === runtimeSrc) {
          setAnalysis({ src, value: analyzeLoadedIcon(event.currentTarget, src) })
        }
        onLoad?.(event)
      }}
      onError={handleError}
      data-icon-contrast={contrast ?? 'none'}
      data-icon-surface={iconSurfaceForColor(surfaceColor)}
    />
  )
}
