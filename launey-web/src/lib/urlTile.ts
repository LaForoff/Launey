import type { UrlTile } from '../types/space'
import { isStoredIconPath } from './iconApi'

const TEXT_ICON_FONT_FAMILY = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif"

export function getTileFallbackIcon(title: string) {
  return title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function getUrlTileDisplayIcon(tile: UrlTile) {
  if (isImageIconPath(tile.icon)) {
    return {
      type: 'image' as const,
      value: tile.icon,
      isAppIcon: isAppStyleIcon(tile.icon),
    }
  }

  return {
    type: 'text' as const,
    value: tile.icon || getTileFallbackIcon(tile.title),
    isAppIcon: false,
  }
}

export function getTextIconDataUrl(text: string) {
  const safeText = text.slice(0, 3).trim() || '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="rgba(255,255,255,0.95)" font-size="30" font-family="${TEXT_ICON_FONT_FAMILY}" font-weight="720" letter-spacing="0">${escapeXml(
    safeText,
  )}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function isImageIconPath(value: string | undefined) {
  if (!value) {
    return false
  }

  if (isStoredIconPath(value)) {
    return true
  }

  return /^https?:\/\//i.test(value) || value.startsWith('data:image/')
}

export function isAppStyleIcon(iconUrl: string | undefined) {
  if (!iconUrl) {
    return false
  }

  const lower = iconUrl.toLowerCase()

  return (
    lower.includes('artworkurl') ||
    lower.includes('itunes.apple') ||
    lower.includes('apps.apple') ||
    lower.includes('appstore') ||
    lower.includes('mzstatic.com')
  )
}
