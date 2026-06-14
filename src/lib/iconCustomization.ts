import type { IconCustomization } from '../types/space'

export const DEFAULT_ICON_CUSTOMIZATION: IconCustomization = {
  scale: 100,
  hasBackground: false,
  backgroundColor: '#00FFF4',
  volumeAlpha: 30,
  volumePlacement: 'above',
  edgeAlpha: 100,
  edgeThickness: 1.5,
}

export function normalizeIconCustomization(value: Partial<IconCustomization> | undefined): IconCustomization {
  return {
    scale: clampNumber(value?.scale, 50, 120, DEFAULT_ICON_CUSTOMIZATION.scale),
    hasBackground: value?.hasBackground ?? DEFAULT_ICON_CUSTOMIZATION.hasBackground,
    backgroundColor: normalizeHexColor(value?.backgroundColor) ?? DEFAULT_ICON_CUSTOMIZATION.backgroundColor,
    volumeAlpha: clampNumber(value?.volumeAlpha, 0, 100, DEFAULT_ICON_CUSTOMIZATION.volumeAlpha),
    volumePlacement:
      value?.volumePlacement === 'below' || value?.volumePlacement === 'above'
        ? value.volumePlacement
        : DEFAULT_ICON_CUSTOMIZATION.volumePlacement,
    edgeAlpha: clampNumber(value?.edgeAlpha, 0, 100, DEFAULT_ICON_CUSTOMIZATION.edgeAlpha),
    edgeThickness: clampDecimal(value?.edgeThickness, 0, 3, DEFAULT_ICON_CUSTOMIZATION.edgeThickness, 1),
  }
}

export function normalizeHexColor(value: string | undefined) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`

  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return null
  }

  return withHash.toUpperCase()
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}

function clampDecimal(value: number | undefined, min: number, max: number, fallback: number, decimals: number) {
  const normalized = clampNumber(value, min, max, fallback)
  const factor = 10 ** decimals
  return Math.round(normalized * factor) / factor
}
