import type { SimpleIcon } from 'simple-icons'
import type { BrandIcon } from './brandIcons'
import { searchColorBrandIcons } from './colorBrandIcons.ts'

let catalogue: Promise<SimpleIcon[]> | undefined
const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '')

// Code-split into a local application asset. No CDN/API and no per-search download.
export async function searchLocalBrandIcons(terms: string[]): Promise<BrandIcon[]> {
  const queries = [...new Set(terms.map(normalize).filter((value) => value.length >= 2))]
  if (!queries.length) return []
  // Original multicolor artwork takes precedence. Load the monochrome catalogue
  // only when the colored collection has no matches for this search.
  const original = await searchColorBrandIcons(terms)
  if (original.length) return original
  const job = catalogue ?? import('simple-icons').then((icons) => Object.values(icons).filter((icon): icon is SimpleIcon => typeof icon === 'object' && 'path' in icon && typeof icon.path === 'string'))
  catalogue = job
  const icons = await job
  return icons.map((icon) => {
    const title = normalize(icon.title)
    const slug = normalize(icon.slug)
    const score = Math.max(...queries.map((query) => title === query || slug === query ? 100 : title.startsWith(query) || slug.startsWith(query) ? 50 : 0))
    return { icon, score }
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.icon.title.localeCompare(b.icon.title))
    .slice(0, 8)
    .map(({ icon }) => {
      // Paths and colors originate in the bundled, version-locked package.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#${icon.hex}"><path d="${icon.path}"/></svg>`
      return {
        id: `simple-icons:${icon.slug}`, name: icon.title, domain: '',
        shape: 'icon', reason: 'product', provider: 'simple-icons', scalable: true,
        artwork: 'monochrome',
        localIcon: `data:image/svg+xml;base64,${btoa(svg)}`,
      }
    })
}
