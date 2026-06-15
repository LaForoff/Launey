import { useEffect, useState, type CSSProperties } from 'react'
import { isCachedIconPath, isLocalUserIconPath } from '../../lib/iconApi'

interface StableIconImageProps {
  src: string
  className: string
  style?: CSSProperties
  alt?: string
  loading?: 'eager' | 'lazy'
  decoding?: 'sync' | 'async' | 'auto'
  fetchPriority?: 'high' | 'low' | 'auto'
  onLoad?: () => void
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
}: StableIconImageProps) {
  const [runtimeSrc, setRuntimeSrc] = useState(src)
  const [didRetry, setDidRetry] = useState(false)

  useEffect(() => {
    setRuntimeSrc(src)
    setDidRetry(false)
  }, [src])

  function handleError() {
    if (didRetry || (!isCachedIconPath(src) && !isLocalUserIconPath(src))) {
      return
    }

    const separator = src.includes('?') ? '&' : '?'
    setRuntimeSrc(`${src}${separator}v=${Date.now()}`)
    setDidRetry(true)
  }

  return (
    <img
      className={className}
      style={style}
      src={runtimeSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onLoad={onLoad}
      onError={handleError}
    />
  )
}
