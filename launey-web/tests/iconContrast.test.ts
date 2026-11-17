import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyIconPixels, iconSurfaceForColor } from '../src/lib/iconContrast.ts'

type Pixel = [number, number, number, number]
function sample(pixels: Pixel[]) {
  return { width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flat()) }
}
const clear: Pixel = [0, 0, 0, 0]
const black: Pixel = [0, 0, 0, 255]
const white: Pixel = [255, 255, 255, 255]

test('transparent single-ink black and white logos adapt, without trusting hidden RGB', () => {
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(8).fill(black), clear, [255, 0, 0, 0]])), 'monochrome')
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(8).fill(white), clear, clear])), 'monochrome')
})

test('opaque pictures and black/white badges preserve their pixels', () => {
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(10).fill(black), white])), 'none')
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(20).fill(black), white, clear, clear])), 'none')
})

test('mixed-color dark and light wordmarks get backing surfaces rather than monochrome filters', () => {
  const color: Pixel = [0, 170, 255, 255]
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(8).fill(black), color, color, clear, clear])), 'dark-content')
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(8).fill(white), color, color, clear, clear])), 'light-content')
  // Space-like lettering occupies roughly half the ink, beside a large colored mark.
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(49).fill(black), ...Array<Pixel>(44).fill(color), ...Array<Pixel>(7).fill(white), clear, clear, clear, clear, clear, clear])), 'dark-content')
})

test('JetBrains-like colored artwork with a black badge and white letters is never inverted', () => {
  const pixels = [clear, clear, ...Array<Pixel>(4).fill(black), white, ...Array<Pixel>(10).fill([255, 40, 110, 255]), ...Array<Pixel>(8).fill([255, 200, 20, 255])]
  assert.equal(classifyIconPixels(sample(pixels)), 'none')
})

test('near-transparent anti-aliasing and empty or tiny images are conservative', () => {
  assert.equal(classifyIconPixels(sample([clear, clear, clear])), 'none')
  assert.equal(classifyIconPixels(sample([black, clear])), 'none')
  assert.equal(classifyIconPixels(sample([...Array<Pixel>(8).fill(black), [255, 0, 255, 3], clear])), 'monochrome')
  assert.equal(classifyIconPixels({ data: [], width: 10, height: 10 }), 'none')
})

test('explicit user background selects contrast independently from the app theme', () => {
  assert.equal(iconSurfaceForColor('#FFFFFF'), 'light')
  assert.equal(iconSurfaceForColor('#000000'), 'dark')
  assert.equal(iconSurfaceForColor('#123456'), 'dark')
  assert.equal(iconSurfaceForColor('#DDF8F5'), 'light')
  assert.equal(iconSurfaceForColor(), 'theme')
  assert.equal(iconSurfaceForColor('invalid'), 'theme')
})
