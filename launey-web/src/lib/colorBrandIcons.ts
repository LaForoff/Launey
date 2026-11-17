import type { IconifyJSON } from '@iconify/types'
import type { BrandIcon } from './brandIcons'

const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '')
const displayNames: Record<string, string> = {
  jetbrains: 'JetBrains', gitlab: 'GitLab', github: 'GitHub', intellij: 'IntelliJ',
  'intellij-idea': 'IntelliJ IDEA', webstorm: 'WebStorm', pycharm: 'PyCharm',
  phpstorm: 'PhpStorm', rubymine: 'RubyMine', clion: 'CLion', datagrip: 'DataGrip',
  goland: 'GoLand', youtrack: 'YouTrack', teamcity: 'TeamCity', nextcloud: 'Nextcloud',
}
let catalogue: Promise<IconifyJSON> | undefined

function baseName(slug: string) {
  return slug.replace(/-(?:icon|wordmark|symbol|horizontal|vertical|light|dark|mono|monochrome)(?:-.*)?$/, '')
}

function hasColor(body: string) {
  // Detect a non-gray palette without changing any path, fill or gradient.
  return [...body.matchAll(/#([a-f\d]{6}|[a-f\d]{3})(?![a-f\d])/gi)].some((match) => {
    const color = match[1].length === 3 ? [...match[1]].map((value) => value + value).join('') : match[1]
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(color.slice(index, index + 2), 16))
    return Math.max(r, g, b) - Math.min(r, g, b) > 24
  })
}

export async function searchColorBrandIcons(terms: string[]): Promise<BrandIcon[]> {
  const queries = [...new Set(terms.map(normalize).filter((value) => value.length >= 2))]
  if (!queries.length) return []
  const job = catalogue ?? import('@iconify-json/logos').then((pack) => pack.icons)
  catalogue = job
  const pack = await job
  const matches = Object.entries(pack.icons).map(([slug, icon]) => {
    const base = baseName(slug)
    const name = displayNames[base] ?? base.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    const score = Math.max(...queries.map((query) => normalize(base) === query || normalize(name) === query ? 100 : normalize(base).startsWith(query) ? 50 : 0))
    const width = icon.width ?? pack.width ?? 24
    const height = icon.height ?? pack.height ?? 24
    const square = width / height >= 0.6 && width / height <= 1.7
    const color = hasColor(icon.body)
    return { slug, base, icon, name, width, height, square, color, score }
  }).filter((item) => item.score > 0)
  return matches.filter((item) => item.color || !matches.some((other) => other.base === item.base && other.square === item.square && other.color))
    .sort((a, b) => b.score - a.score || Number(b.square) - Number(a.square) || Number(b.color) - Number(a.color) || a.slug.localeCompare(b.slug))
    .slice(0, 8)
    .map(({ slug, icon, name, width, height, square, color }) => {
      // Trusted version-locked local asset: preserve the supplied multi-path SVG.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${icon.left ?? pack.left ?? 0} ${icon.top ?? pack.top ?? 0} ${width} ${height}">${icon.body}</svg>`
      const encoded = btoa(Array.from(new TextEncoder().encode(svg), (byte) => String.fromCharCode(byte)).join(''))
      return {
        id: `svg-logos:${slug}`, name, domain: '', width, height,
        shape: square ? 'icon' : 'wordmark', reason: 'product', provider: 'svg-logos',
        scalable: true, artwork: color ? 'original' : 'monochrome', localIcon: `data:image/svg+xml;base64,${encoded}`,
      }
    })
}
