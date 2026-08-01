import type { SpaceBackground } from '../types/space'

type Rgb = { r: number; g: number; b: number }

export async function extractBackgroundPalette(
  background: SpaceBackground,
  colorCount = 6,
): Promise<string[] | null> {
  if (background.type === 'default') {
    return null
  }

  const source = background.type === 'image-url' || background.type === 'local-image'
    ? await loadImage(background.value)
    : await loadVideoFrame(background.value)

  if (!source) {
    return null
  }

  try {
    return samplePalette(source, colorCount)
  } catch {
    return null
  } finally {
    if (source instanceof HTMLVideoElement) {
      source.removeAttribute('src')
      source.load()
    }
  }
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.src = src
    await image.decode()
    return image
  } catch {
    return null
  }
}

async function loadVideoFrame(src: string): Promise<HTMLVideoElement | null> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = src

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('video-palette-timeout')), 5000)
      const finish = (callback: () => void) => {
        window.clearTimeout(timeout)
        callback()
      }
      video.addEventListener('loadeddata', () => finish(resolve), { once: true })
      video.addEventListener('error', () => finish(() => reject(new Error('video-palette-error'))), { once: true })
      video.load()
    })
    return video
  } catch {
    video.removeAttribute('src')
    video.load()
    return null
  }
}

function samplePalette(source: CanvasImageSource, colorCount: number): string[] | null {
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 32
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return null
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>()

  for (let index = 0; index < pixels.length; index += 8) {
    if (pixels[index + 3] < 192) continue
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const brightness = (red + green + blue) / (3 * 255)
    if (brightness < 0.06 || brightness > 0.96) continue
    const key = `${red >> 5}-${green >> 5}-${blue >> 5}`
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 }
    bucket.count += 1
    bucket.red += red
    bucket.green += green
    bucket.blue += blue
    buckets.set(key, bucket)
  }

  const candidates = [...buckets.values()]
    .map((bucket) => ({
      r: bucket.red / bucket.count,
      g: bucket.green / bucket.count,
      b: bucket.blue / bucket.count,
      count: bucket.count,
    }))
    .sort((left, right) => right.count * (0.5 + saturation(right)) - left.count * (0.5 + saturation(left)))

  const selected: Rgb[] = []
  for (const candidate of candidates) {
    if (selected.every((color) => colorDistance(color, candidate) > 58)) {
      selected.push(candidate)
    }
    if (selected.length === colorCount) break
  }

  if (selected.length === 0) {
    return null
  }

  while (selected.length < colorCount) {
    selected.push(selected[selected.length % selected.length])
  }

  return selected.map(toFlowColor)
}

function saturation({ r, g, b }: Rgb) {
  const maximum = Math.max(r, g, b)
  const minimum = Math.min(r, g, b)
  return maximum === 0 ? 0 : (maximum - minimum) / maximum
}

function colorDistance(left: Rgb, right: Rgb) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b)
}

function toFlowColor({ r, g, b }: Rgb) {
  const maximum = Math.max(r, g, b)
  const lift = maximum < 112 ? 112 / Math.max(maximum, 1) : 1
  return `rgb(${Math.min(255, Math.round(r * lift))}, ${Math.min(255, Math.round(g * lift))}, ${Math.min(255, Math.round(b * lift))})`
}
