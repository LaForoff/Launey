const SAMPLE_WIDTH = 96
const MIN_SAMPLE_HEIGHT = 54
const MAX_SAMPLE_HEIGHT = 96
const DIM_OVERLAY_MAX_OPACITY = 0.65
const COMFORTABLE_BACKGROUND_LUMINANCE = 0.38
const DARK_BACKGROUND_THRESHOLD = 0.42

/**
 * Estimates how much of Launey's existing background dim control is needed
 * for white interface text to remain legible over an uploaded image.
 */
export async function getRecommendedBackgroundDim(file: File) {
  if (!file.type.startsWith('image/')) {
    return undefined
  }

  const bitmap = await createImageBitmap(file)

  try {
    const sampleHeight = Math.max(
      MIN_SAMPLE_HEIGHT,
      Math.min(MAX_SAMPLE_HEIGHT, Math.round(SAMPLE_WIDTH * (bitmap.height / bitmap.width))),
    )
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_WIDTH
    canvas.height = sampleHeight

    const context = canvas.getContext('2d', { willReadFrequently: true })

    if (!context) {
      return undefined
    }

    context.drawImage(bitmap, 0, 0, SAMPLE_WIDTH, sampleHeight)
    const pixels = context.getImageData(0, 0, SAMPLE_WIDTH, sampleHeight).data
    const luminanceValues: number[] = []
    let luminanceTotal = 0

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 16) {
        continue
      }

      const luminance =
        (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255
      luminanceValues.push(luminance)
      luminanceTotal += luminance
    }

    if (luminanceValues.length === 0) {
      return undefined
    }

    luminanceValues.sort((first, second) => first - second)
    const averageLuminance = luminanceTotal / luminanceValues.length
    const brightAreaLuminance = luminanceValues[Math.floor((luminanceValues.length - 1) * 0.75)]
    const sceneLuminance = averageLuminance * 0.3 + brightAreaLuminance * 0.7

    if (sceneLuminance <= DARK_BACKGROUND_THRESHOLD) {
      return 0
    }

    const requiredOverlayOpacity = 1 - COMFORTABLE_BACKGROUND_LUMINANCE / sceneLuminance
    const dimValue = (requiredOverlayOpacity / DIM_OVERLAY_MAX_OPACITY) * 100

    return Math.max(0, Math.min(100, Math.ceil(dimValue / 5) * 5))
  } finally {
    bitmap.close()
  }
}
