export type IconContrast = 'none' | 'monochrome' | 'dark-content' | 'light-content'
export type IconSurface = 'theme' | 'light' | 'dark'

interface PixelImage { data: ArrayLike<number>; width: number; height: number }
const cache = new Map<string, IconContrast>()
const MAX_CACHE_ENTRIES = 200

export function classifyIconPixels({ data, width, height }: PixelImage): IconContrast {
  const total = width * height
  if (!total || data.length < total * 4) return 'none'
  let transparent = 0, ink = 0, neutral = 0, dark = 0, light = 0
  let minimum = 255, maximum = 0
  for (let index = 0; index < total * 4; index += 4) {
    const [r, g, b, alpha] = [data[index], data[index + 1], data[index + 2], data[index + 3]]
    if (alpha < 16) transparent += 1
    if (alpha < 128) continue
    ink += 1
    const high = Math.max(r, g, b), low = Math.min(r, g, b)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (high - low <= 18) neutral += 1
    minimum = Math.min(minimum, luminance)
    maximum = Math.max(maximum, luminance)
    if (luminance < 65) dark += 1
    if (luminance > 210) light += 1
  }
  // Analyze the actual image rectangle, without inventing transparent letterboxing.
  // Opaque photos/backgrounds and two-tone black/white badges are never recolored.
  if (ink < 3 || transparent / total < 0.05) return 'none'
  if (neutral / ink >= 0.995) return maximum - minimum <= 36 ? 'monochrome' : 'none'
  // Preserve colors. A backing surface helps predominantly dark/light wordmarks.
  if (dark / ink >= 0.4 && light / ink < 0.08) return 'dark-content'
  if (light / ink >= 0.4 && dark / ink < 0.08) return 'light-content'
  return 'none'
}

export function iconSurfaceForColor(color?: string): IconSurface {
  if (!color || !/^#[a-f\d]{6}$/i.test(color)) return 'theme'
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(color.slice(index, index + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  return luminance < 0.179 ? 'dark' : 'light'
}

export function getCachedIconContrast(src: string): IconContrast | undefined {
  return cache.get(src)
}

export function analyzeLoadedIcon(image: HTMLImageElement, src: string): IconContrast {
  const existing = cache.get(src)
  if (existing) return existing
  // Search results and saved icons are local. Never re-fetch external images for analysis.
  if (!/^(?:\/(?!\/)|data:image\/|blob:)/i.test(src) || !image.naturalWidth || !image.naturalHeight) return 'none'
  try {
    const scale = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return 'none'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const result = classifyIconPixels(context.getImageData(0, 0, canvas.width, canvas.height))
    // Bound both entry count and retained data URL sizes. Failures are not cached.
    if (src.length <= 16_384) {
      cache.set(src, result)
      while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
    }
    return result
  } catch { return 'none' }
}
