import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import type { IconCustomization, SpaceBackground } from '../src/types/space'

const ICONS_PUBLIC_DIR = resolve(process.cwd(), 'public/user-icons')
const ICON_CACHE_PUBLIC_DIR = resolve(process.cwd(), 'public/icon-cache')
const ARC_IMPORT_FILE = resolve(process.cwd(), 'import/launey-spaces-from-arc.json')
const SETTINGS_DATA_DIR = resolve(process.cwd(), 'data')
const SETTINGS_FILE = resolve(SETTINGS_DATA_DIR, 'settings.json')
const ICON_PATH_PREFIX = '/user-icons/'
const ICON_CACHE_PATH_PREFIX = '/icon-cache/'
const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.avif',
])
const APP_STORE_COUNTRIES = ['us', 'ru', 'gb', 'tr', 'de', 'fr', 'pl', 'kz'] as const
const MIN_RELEVANCE_SCORE = 40
const SITE_ICONS_CACHE_TTL_MS = 1000 * 60 * 30
const DEFAULT_APP_SETTINGS = {
  appearanceTheme: 'system',
  backgroundBlur: 0,
  backgroundDim: 0,
  weatherLocation: 'Russia, Moscow',
  background: { type: 'default' },
} as const

const LAUNEY_EXPORT_VERSION = 1 as const

type ExportUrlItem = {
  type: 'url'
  id: string
  title: string
  url: string
  icon: string
  addFrame: boolean
  iconCustomization?: IconCustomization
  restoreOrigin?: {
    spaceId: string
    tileIndex: number
  }
}

type ExportFolderItem = {
  type: 'folder'
  id: string
  title: string
  icon?: string
  items: ExportUrlItem[]
}

type ExportSpace = {
  id: string
  title: string
  background?: SpaceBackground
  items: Array<ExportUrlItem | ExportFolderItem>
}

type LauneyExportPayload = {
  version: number
  app: string
  exportedAt: string
  settings: AppSettingsPayload
  spaces: ExportSpace[]
  activeSpaceId: string
  assets: {
    icons: Record<string, { mimeType: string; data: string }>
  }
  warnings?: string[]
}

export function iconApiPlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (
      !req.url?.startsWith('/api/icons') &&
      req.url !== '/api/cache-icon' &&
      req.url !== '/api/arc-import-spaces' &&
      !req.url?.startsWith('/api/app-store-icon') &&
      !req.url?.startsWith('/api/site-icons') &&
      !req.url?.startsWith('/api/settings') &&
      req.url !== '/api/export' &&
      req.url !== '/api/import'
    ) {
      next()
      return
    }

    void handleIconRequest(req, res, next)
  }

  return {
    name: 'icon-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

async function handleIconRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  try {
    if (req.method === 'POST' && req.url === '/api/icons') {
      const buffer = await readRequestBody(req)
      const fileNameHeader = getHeaderValue(req.headers['x-file-name'])
      const contentType = getHeaderValue(req.headers['content-type'])

      if (buffer.length === 0) {
        sendJson(res, 400, { error: 'Empty file' })
        return
      }

      const iconPath = saveIconFile(buffer, fileNameHeader, contentType)
      sendJson(res, 200, { path: iconPath })
      return
    }

    if (req.method === 'POST' && req.url === '/api/cache-icon') {
      const rawBody = (await readRequestBody(req)).toString('utf8')
      const parsedBody = rawBody ? parseCacheIconRequest(rawBody) : {}
      const remoteUrl = parsedBody.iconUrl?.trim()

      if (!remoteUrl) {
        sendJson(res, 400, { error: 'Invalid icon url' })
        return
      }

      const localIcon = await cacheRemoteIconFile(remoteUrl)
      sendJson(res, 200, { ok: true, localIcon })
      return
    }

    if (req.method === 'POST' && req.url === '/api/icons/cache-remote') {
      const rawBody = (await readRequestBody(req)).toString('utf8')
      const parsedBody = rawBody ? parseRemoteIconRequest(rawBody) : {}
      const remoteUrl = parsedBody.url?.trim()

      if (!remoteUrl) {
        sendJson(res, 400, { error: 'Invalid icon url' })
        return
      }

      const localIcon = await cacheRemoteIconFile(remoteUrl)
      sendJson(res, 200, { path: localIcon })
      return
    }

    if (req.method === 'DELETE' && req.url === '/api/icons') {
      const rawBody = (await readRequestBody(req)).toString('utf8')
      const parsedBody = rawBody ? parseDeleteRequest(rawBody) : {}

      if (!isSafeIconPath(parsedBody.path)) {
        sendJson(res, 400, { error: 'Invalid icon path' })
        return
      }

      unlinkSync(resolve(ICONS_PUBLIC_DIR, parsedBody.path.slice(ICON_PATH_PREFIX.length)))
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && req.url === '/api/arc-import-spaces') {
      const rawJson = readFileSync(ARC_IMPORT_FILE, 'utf8')
      sendJson(res, 200, JSON.parse(rawJson))
      return
    }

    if (req.method === 'GET' && req.url === '/api/settings') {
      const settings = ensureSettingsFile()
      console.log('[settings] loaded from file')
      sendJson(res, 200, settings)
      return
    }

    if (req.method === 'POST' && req.url === '/api/export') {
      const rawBody = (await readRequestBody(req)).toString('utf8')
      const parsedBody = rawBody ? parseExportRequest(rawBody) : null

      if (!parsedBody) {
        sendJson(res, 400, { error: 'Invalid export payload' })
        return
      }

      const payload = await buildLauneyExport(parsedBody)
      const fileName = `launey-export-${new Date().toISOString().slice(0, 10)}.launeyexport`
      sendFileJson(res, fileName, payload)
      return
    }

    if (req.method === 'POST' && req.url === '/api/import') {
      const rawBody = (await readRequestBody(req)).toString('utf8')
      const parsedBody = rawBody ? parseImportRequest(rawBody) : null

      if (!parsedBody) {
        sendJson(res, 400, { error: 'Invalid import payload' })
        return
      }

      const imported = await applyLauneyImport(parsedBody)
      sendJson(res, 200, imported)
      return
    }

    if (req.method === 'POST' && req.url === '/api/settings') {
      const rawBody = (await readRequestBody(req)).toString('utf8')
      const parsedBody = rawBody ? parseSettingsRequest(rawBody) : {}
      const settings = sanitizeSettingsPayload(parsedBody)
      writeSettingsFile(settings)
      console.log('[settings] saved to file')
      sendJson(res, 200, settings)
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/app-store-icon')) {
      const requestUrl = new URL(req.url, 'http://localhost')
      const query = requestUrl.searchParams.get('query')?.trim() ?? ''
      const countryParam = requestUrl.searchParams.get('country')?.trim().toLowerCase()
      const selectedCountry =
        countryParam && APP_STORE_COUNTRIES.includes(countryParam as (typeof APP_STORE_COUNTRIES)[number])
          ? countryParam
          : undefined

      if (query.length < 2) {
        sendJson(res, 200, { ok: false, error: 'Иконка не найдена' })
        return
      }

      const iconPayload = await findAppStoreIcon(query, selectedCountry)
      sendJson(res, 200, iconPayload)
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/site-icons')) {
      const requestUrl = new URL(req.url, 'http://localhost')
      const rawUrl = requestUrl.searchParams.get('url')?.trim() ?? ''

      if (!rawUrl) {
        sendJson(res, 200, { ok: false, error: 'Иконки не найдены' })
        return
      }

      const payload = await findSiteIcons(rawUrl)
      sendJson(res, 200, payload)
      return
    }

    next()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status =
      message === 'Invalid JSON body' ||
      message === 'Invalid icon path' ||
      message === 'Invalid settings payload'
        ? 400
        : 500

    sendJson(res, status, { error: message })
  }
}

interface AppStoreSearchResult {
  trackName?: string
  trackViewUrl?: string
  bundleId?: string
  sellerName?: string
}

interface SiteIconCandidate {
  id: string
  type: 'apple-touch-icon' | 'manifest' | 'og-image' | 'favicon' | 'google-favicon' | 'generated'
  url: string
  previewUrl: string
  source: string
  score: number
}

type SiteIconsPayload =
  | {
      ok: true
      domain: string
      candidates: SiteIconCandidate[]
    }
  | {
      ok: false
      error: string
    }

interface SiteIconsCacheEntry {
  expiresAt: number
  payload: SiteIconsPayload
}

const siteIconsCache = new Map<string, SiteIconsCacheEntry>()

type AppSettingsPayload = {
  appearanceTheme: 'system' | 'light' | 'dark'
  backgroundBlur: number
  backgroundDim: number
  weatherLocation: string
  background:
    | { type: 'default' }
    | { type: 'image-url'; value: string }
    | { type: 'video-url'; value: string }
    | { type: 'local-image'; value: string; fileName?: string }
    | { type: 'local-video'; value: string; fileName?: string }
}

async function findAppStoreIcon(query: string, country?: string) {
  const countries = country ? [country] : [...APP_STORE_COUNTRIES]

  for (const countryCode of countries) {
    const payload = await findAppStoreIconsByCountry(query, countryCode)

    if (payload.ok) {
      return payload
    }
  }

  return {
    ok: false as const,
    error: 'Иконка не найдена в App Store',
  }
}

async function findAppStoreIconsByCountry(query: string, country: string) {
  const searchResponse = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=${country}&media=software&entity=software&limit=15`,
  )

  if (!searchResponse.ok) {
    return { ok: false as const, error: 'Иконка не найдена в App Store' }
  }

  const searchPayload = (await searchResponse.json()) as { results?: AppStoreSearchResult[] }
  const relevantCandidates = (searchPayload.results ?? [])
    .map((app) => ({
      ...app,
      score: getRelevanceScore(query, app),
    }))
    .filter((app) => app.score >= MIN_RELEVANCE_SCORE && app.trackViewUrl)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  if (relevantCandidates.length === 0) {
    return { ok: false as const, error: 'Иконка не найдена в App Store' }
  }

  const resolved = await Promise.all(
    relevantCandidates.map(async (candidate) => {
      const iconUrl = await parseAppIconFromAppPage(candidate.trackViewUrl ?? '')

      if (!iconUrl) {
        return null
      }

      return {
        title: candidate.trackName ?? query,
        appUrl: candidate.trackViewUrl ?? '',
        iconUrl,
        country,
        matchedName: candidate.trackName ?? '',
        score: candidate.score,
      }
    }),
  )

  const results = resolved.filter((value): value is NonNullable<typeof value> => Boolean(value))

  if (results.length === 0) {
    return { ok: false as const, error: 'Иконка не найдена в App Store' }
  }

  return {
    ok: true as const,
    title: results[0].title,
    appUrl: results[0].appUrl,
    iconUrl: results[0].iconUrl,
    country,
    matchedName: results[0].matchedName,
    score: results[0].score,
    results,
  }
}

function getRelevanceScore(query: string, app: AppStoreSearchResult) {
  const normalizedQuery = normalizeForMatch(query)
  const track = normalizeForMatch(app.trackName)
  const seller = normalizeForMatch(app.sellerName)
  const bundle = normalizeForMatch(app.bundleId)

  if (!normalizedQuery) {
    return 0
  }

  let score = 0

  score += getFieldScore(normalizedQuery, track, 120, 95, 65)
  score += getFieldScore(normalizedQuery, seller, 40, 28, 14)
  score += getFieldScore(normalizedQuery, bundle, 42, 30, 18)

  if (track.includes('studio') && normalizedQuery === 'youtube') {
    score -= 55
  }

  if (track.includes('music') && !normalizedQuery.includes('music')) {
    score -= 18
  }

  return Math.max(score, 0)
}

function getFieldScore(query: string, value: string, exact: number, startsWith: number, includes: number) {
  if (!value) {
    return 0
  }

  if (value === query) {
    return exact
  }

  if (value.startsWith(query)) {
    return startsWith
  }

  if (value.includes(query)) {
    return includes
  }

  return 0
}

function normalizeForMatch(value: string | undefined) {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .trim()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
}

async function parseAppIconFromAppPage(appUrl: string) {
  try {
    const response = await fetch(appUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      },
    })

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    const candidates = collectMzstaticIconCandidates(html)
    const bestCandidate = pickBestIconCandidate(candidates)

    return bestCandidate
  } catch {
    return null
  }
}

function collectMzstaticIconCandidates(html: string) {
  const candidates = new Set<string>()

  for (const metaMatch of html.matchAll(
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
  )) {
    const value = metaMatch[1]
    if (value) {
      candidates.add(value)
    }
  }

  for (const ldJsonMatch of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const rawJson = ldJsonMatch[1]

    try {
      const parsed = JSON.parse(rawJson) as { image?: string | string[] }
      const images = Array.isArray(parsed.image) ? parsed.image : [parsed.image]

      for (const image of images) {
        if (typeof image === 'string') {
          candidates.add(image)
        }
      }
    } catch {
      // ignore invalid json blocks
    }
  }

  for (const urlMatch of html.matchAll(/https?:\/\/[^"' )]+mzstatic[^"' )]+/gi)) {
    candidates.add(urlMatch[0])
  }

  return [...candidates].filter((url) => url.includes('mzstatic.com'))
}

function pickBestIconCandidate(candidates: string[]) {
  if (candidates.length === 0) {
    return null
  }

  const sorted = candidates
    .map((url) => ({ url, score: getIconScore(url) }))
    .sort((a, b) => b.score - a.score)

  return normalizeMzstaticIconSize(sorted[0]?.url ?? null)
}

function getIconScore(url: string) {
  let score = 0
  const lower = url.toLowerCase()

  if (lower.includes('400x400')) {
    score += 10
  }

  if (lower.includes('.webp')) {
    score += 4
  } else if (lower.includes('.png')) {
    score += 3
  }

  if (lower.includes('/image/thumb/')) {
    score += 2
  }

  const sizeMatch = lower.match(/(\d{2,4})x(\d{2,4})bb/)
  if (sizeMatch) {
    score += Number(sizeMatch[1]) / 100
  }

  return score
}

function normalizeMzstaticIconSize(url: string | null) {
  if (!url) {
    return null
  }

  return url.replace(/\/(?:100|120|180|512)x(?:100|120|180|512)bb(?:-\d+)?(?=\.)/i, '/400x400bb-75')
}

async function findSiteIcons(rawUrl: string): Promise<SiteIconsPayload> {
  const pageUrl = normalizeSiteUrl(rawUrl)
  const cached = siteIconsCache.get(pageUrl)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return cached.payload
  }

  try {
    const pageResponse = await fetch(pageUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      },
    })

    if (!pageResponse.ok) {
      return buildFallbackSiteIconsPayload(pageUrl)
    }

    const resolvedPageUrl = pageResponse.url || pageUrl
    const pageOrigin = new URL(resolvedPageUrl).origin
    const html = await pageResponse.text()
    const candidates = new Map<string, SiteIconCandidate>()

    collectHtmlLinkCandidates(html, resolvedPageUrl, candidates)
    collectMetaCandidates(html, resolvedPageUrl, candidates)
    await collectManifestCandidates(html, resolvedPageUrl, candidates)
    collectFallbackCandidates(resolvedPageUrl, pageOrigin, candidates)
    collectGeneratedCandidates(candidates)

    const sorted = [...candidates.values()].sort((a, b) => b.score - a.score)

    if (sorted.length === 0) {
      return buildFallbackSiteIconsPayload(resolvedPageUrl)
    }

    const successPayload = {
      ok: true as const,
      domain: new URL(resolvedPageUrl).hostname,
      candidates: sorted,
    }
    siteIconsCache.set(pageUrl, { expiresAt: now + SITE_ICONS_CACHE_TTL_MS, payload: successPayload })
    return successPayload
  } catch {
    return buildFallbackSiteIconsPayload(pageUrl)
  }
}

function buildFallbackSiteIconsPayload(pageUrl: string): SiteIconsPayload {
  try {
    const pageOrigin = new URL(pageUrl).origin
    const candidates = new Map<string, SiteIconCandidate>()
    collectFallbackCandidates(pageUrl, pageOrigin, candidates)
    collectGeneratedCandidates(candidates)
    const sorted = [...candidates.values()].sort((a, b) => b.score - a.score)

    if (sorted.length === 0) {
      return { ok: false, error: 'Иконки не найдены' }
    }

    return {
      ok: true,
      domain: new URL(pageUrl).hostname,
      candidates: sorted,
    }
  } catch {
    return { ok: false, error: 'Иконки не найдены' }
  }
}

function normalizeSiteUrl(rawUrl: string) {
  const value = rawUrl.trim()
  const prefixed = /^https?:\/\//i.test(value) ? value : `https://${value}`
  return new URL(prefixed).toString()
}

function collectHtmlLinkCandidates(
  html: string,
  pageUrl: string,
  candidates: Map<string, SiteIconCandidate>,
) {
  for (const tagMatch of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = tagMatch[0]
    const rel = readHtmlAttribute(tag, 'rel')?.toLowerCase() ?? ''
    const href = readHtmlAttribute(tag, 'href')

    if (!href) {
      continue
    }

    const normalizedRel = rel.replace(/\s+/g, ' ').trim()
    const absUrl = toAbsoluteUrl(href, pageUrl)

    if (!absUrl) {
      continue
    }

    if (normalizedRel.includes('apple-touch-icon-precomposed') || normalizedRel.includes('apple-touch-icon')) {
      upsertSiteCandidate(candidates, {
        type: 'apple-touch-icon',
        url: absUrl,
        previewUrl: absUrl,
        source: 'Apple Touch Icon',
        score: 96 + scoreFromDeclaredSizes(readHtmlAttribute(tag, 'sizes')),
      })
      continue
    }

    if (
      normalizedRel.includes('shortcut icon') ||
      normalizedRel === 'icon' ||
      normalizedRel.includes(' icon') ||
      normalizedRel.includes('mask-icon')
    ) {
      upsertSiteCandidate(candidates, {
        type: 'favicon',
        url: absUrl,
        previewUrl: absUrl,
        source: normalizedRel.includes('mask-icon') ? 'Mask Icon' : 'Favicon',
        score: 38 + scoreFromDeclaredSizes(readHtmlAttribute(tag, 'sizes')),
      })
    }
  }
}

function collectMetaCandidates(
  html: string,
  pageUrl: string,
  candidates: Map<string, SiteIconCandidate>,
) {
  for (const tagMatch of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = tagMatch[0]
    const property = readHtmlAttribute(tag, 'property')?.toLowerCase()
    const name = readHtmlAttribute(tag, 'name')?.toLowerCase()
    const content = readHtmlAttribute(tag, 'content')

    if (!content) {
      continue
    }

    if (property !== 'og:image' && name !== 'twitter:image') {
      continue
    }

    const absUrl = toAbsoluteUrl(content, pageUrl)

    if (!absUrl) {
      continue
    }

    upsertSiteCandidate(candidates, {
      type: 'og-image',
      url: absUrl,
      previewUrl: absUrl,
      source: property === 'og:image' ? 'Open Graph' : 'Twitter',
      score: 64 + scoreFromUrlSize(absUrl),
    })
  }
}

async function collectManifestCandidates(
  html: string,
  pageUrl: string,
  candidates: Map<string, SiteIconCandidate>,
) {
  const manifestUrl = findManifestUrl(html, pageUrl)

  if (!manifestUrl) {
    return
  }

  try {
    const response = await fetch(manifestUrl, { redirect: 'follow' })

    if (!response.ok) {
      return
    }

    const payload = (await response.json()) as {
      icons?: Array<{ src?: string; sizes?: string; type?: string }>
    }

    for (const icon of payload.icons ?? []) {
      if (!icon.src) {
        continue
      }

      const absUrl = toAbsoluteUrl(icon.src, manifestUrl)

      if (!absUrl) {
        continue
      }

      const sizeScore = scoreFromDeclaredSizes(icon.sizes)
      const mimeBonus = icon.type?.includes('svg') ? 4 : icon.type?.includes('png') ? 8 : 0

      upsertSiteCandidate(candidates, {
        type: 'manifest',
        url: absUrl,
        previewUrl: absUrl,
        source: 'Manifest Icon',
        score: 84 + sizeScore + mimeBonus + scoreFromUrlSize(absUrl),
      })
    }
  } catch {
    // ignore
  }
}

function findManifestUrl(html: string, pageUrl: string) {
  for (const tagMatch of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = tagMatch[0]
    const rel = readHtmlAttribute(tag, 'rel')?.toLowerCase() ?? ''
    const href = readHtmlAttribute(tag, 'href')

    if (!href || !rel.includes('manifest')) {
      continue
    }

    return toAbsoluteUrl(href, pageUrl)
  }

  return null
}

function collectFallbackCandidates(
  pageUrl: string,
  pageOrigin: string,
  candidates: Map<string, SiteIconCandidate>,
) {
  const domain = new URL(pageUrl).hostname
  const faviconUrl = `${pageOrigin}/favicon.ico`
  const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`

  upsertSiteCandidate(candidates, {
    type: 'favicon',
    url: faviconUrl,
    previewUrl: faviconUrl,
    source: 'Favicon fallback',
    score: 25,
  })

  upsertSiteCandidate(candidates, {
    type: 'google-favicon',
    url: googleUrl,
    previewUrl: googleUrl,
    source: 'Google Favicon',
    score: 18,
  })
}

function collectGeneratedCandidates(candidates: Map<string, SiteIconCandidate>) {
  const baseCandidates = [...candidates.values()]
    .filter((candidate) => candidate.type !== 'google-favicon')
    .slice(0, 6)

  for (const candidate of baseCandidates) {
    const generated = buildGeneratedIconDataUrl(candidate.url)
    if (!generated) {
      continue
    }

    upsertSiteCandidate(candidates, {
      type: 'generated',
      url: generated,
      previewUrl: generated,
      source: `Generated from ${candidate.source}`,
      score: candidate.score + 2,
    })
  }
}

function buildGeneratedIconDataUrl(sourceUrl: string) {
  const escaped = sourceUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3A3D48"/><stop offset="1" stop-color="#2C303A"/></linearGradient></defs><rect width="512" height="512" rx="136" fill="url(#g)"/><image href="${escaped}" x="102" y="102" width="308" height="308" preserveAspectRatio="xMidYMid meet"/></svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function readHtmlAttribute(tag: string, attribute: string) {
  const regex = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i')
  const match = tag.match(regex)
  return match?.[1]?.trim()
}

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return null
  }
}

function scoreFromDeclaredSizes(sizesValue: string | undefined) {
  if (!sizesValue) {
    return 0
  }

  let score = 0

  for (const token of sizesValue.split(/\s+/)) {
    const sizeMatch = token.toLowerCase().match(/(\d{2,4})x(\d{2,4})/)
    if (!sizeMatch) {
      continue
    }

    const width = Number(sizeMatch[1])
    const height = Number(sizeMatch[2])
    const minSide = Math.min(width, height)
    const ratio = Math.max(width, height) / Math.max(1, minSide)

    if (minSide >= 512) {
      score += 16
    } else if (minSide >= 192) {
      score += 12
    } else if (minSide >= 180) {
      score += 9
    } else if (minSide >= 96) {
      score += 4
    }

    if (ratio <= 1.2) {
      score += 4
    }
  }

  return score
}

function scoreFromUrlSize(url: string) {
  const lower = url.toLowerCase()
  const match = lower.match(/(\d{2,4})[x_](\d{2,4})/)

  if (!match) {
    return lower.endsWith('.svg') ? 6 : 0
  }

  const width = Number(match[1])
  const height = Number(match[2])
  const minSide = Math.min(width, height)
  const ratio = Math.max(width, height) / Math.max(1, minSide)
  let score = 0

  if (minSide >= 512) {
    score += 16
  } else if (minSide >= 192) {
    score += 11
  } else if (minSide >= 180) {
    score += 8
  } else if (minSide >= 96) {
    score += 3
  }

  if (ratio <= 1.2) {
    score += 4
  }

  return score
}

function upsertSiteCandidate(
  candidates: Map<string, SiteIconCandidate>,
  candidate: Omit<SiteIconCandidate, 'id'>,
) {
  const current = candidates.get(candidate.previewUrl)

  if (current && current.score >= candidate.score) {
    return
  }

  const id = candidate.previewUrl.startsWith('data:image/')
    ? `generated-${randomUUID()}`
    : `${candidate.type}-${hashString(candidate.previewUrl)}`

  candidates.set(candidate.previewUrl, {
    ...candidate,
    id,
  })
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function saveIconFile(buffer: Buffer, fileNameHeader: string | undefined, contentType: string | undefined) {
  mkdirSync(ICONS_PUBLIC_DIR, { recursive: true })

  const extension = resolveExtension(fileNameHeader, contentType)
  const fileName = `icon-${randomUUID()}${extension}`
  const filePath = resolve(ICONS_PUBLIC_DIR, fileName)

  writeFileSync(filePath, buffer)

  return `${ICON_PATH_PREFIX}${fileName}`
}

function resolveExtension(fileNameHeader: string | undefined, contentType: string | undefined) {
  const decodedName = fileNameHeader ? decodeURIComponent(fileNameHeader) : ''
  const fileExtension = extname(decodedName).toLowerCase()

  if (ALLOWED_EXTENSIONS.has(fileExtension)) {
    return fileExtension
  }

  const mappedContentType = getExtensionByContentType(contentType)

  if (mappedContentType) {
    return mappedContentType
  }

  return '.png'
}

function getExtensionByContentType(contentType: string | undefined) {
  switch (contentType?.split(';')[0]?.trim().toLowerCase()) {
    case 'image/png':
      return '.png'
    case 'image/jpeg':
      return '.jpg'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    case 'image/svg+xml':
      return '.svg'
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return '.ico'
    case 'image/bmp':
      return '.bmp'
    case 'image/avif':
      return '.avif'
    default:
      return null
  }
}

function isSafeIconPath(value: string | undefined): value is string {
  if (typeof value !== 'string' || !value.startsWith(ICON_PATH_PREFIX)) {
    return false
  }

  if (value.includes('..') || value.includes('\\') || value.includes('\0')) {
    return false
  }

  const fileName = value.slice(ICON_PATH_PREFIX.length)

  return fileName.length > 0 && resolve(ICONS_PUBLIC_DIR, fileName).startsWith(`${ICONS_PUBLIC_DIR}/`)
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseDeleteRequest(rawBody: string) {
  try {
    return JSON.parse(rawBody) as { path?: string }
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function parseSettingsRequest(rawBody: string) {
  try {
    return JSON.parse(rawBody) as Partial<AppSettingsPayload>
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function parseRemoteIconRequest(rawBody: string) {
  try {
    return JSON.parse(rawBody) as { url?: string }
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function parseCacheIconRequest(rawBody: string) {
  try {
    return JSON.parse(rawBody) as { iconUrl?: string; itemId?: string }
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function parseExportRequest(rawBody: string) {
  try {
    const payload = JSON.parse(rawBody) as {
      spaces?: unknown
      activeSpaceId?: unknown
      settings?: unknown
    }

    return payload
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function parseImportRequest(rawBody: string) {
  try {
    const payload = JSON.parse(rawBody) as { file?: unknown }
    return payload.file
  } catch {
    throw new Error('Invalid JSON body')
  }
}

async function cacheRemoteIconFile(iconUrl: string) {
  mkdirSync(ICON_CACHE_PUBLIC_DIR, { recursive: true })

  const hash = createHash('sha256').update(iconUrl).digest('hex').slice(0, 16)

  if (iconUrl.startsWith('data:image/')) {
    const { buffer, contentType } = decodeDataImageUrl(iconUrl)
    const extension = getExtensionByContentType(contentType) ?? '.png'
    const fileName = `icon-${hash}${extension}`
    const filePath = resolve(ICON_CACHE_PUBLIC_DIR, fileName)

    if (!existsSync(filePath)) {
      writeFileSync(filePath, buffer)
    }

    return `${ICON_CACHE_PATH_PREFIX}${fileName}`
  }

  if (!/^https?:\/\//i.test(iconUrl)) {
    throw new Error('Failed to download remote icon')
  }

  const response = await fetch(iconUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to download remote icon')
  }

  const contentType = response.headers.get('content-type') ?? undefined
  const extension = getExtensionByContentType(contentType) ?? resolveExtension(response.url || iconUrl, contentType)
  const fileName = `icon-${hash}${extension}`
  const filePath = resolve(ICON_CACHE_PUBLIC_DIR, fileName)

  if (existsSync(filePath)) {
    return `${ICON_CACHE_PATH_PREFIX}${fileName}`
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  writeFileSync(filePath, buffer)

  return `${ICON_CACHE_PATH_PREFIX}${fileName}`
}

async function buildLauneyExport(payload: {
  spaces?: unknown
  activeSpaceId?: unknown
  settings?: unknown
}): Promise<LauneyExportPayload> {
  const spaces = sanitizeExportSpaces(payload.spaces)
  const activeSpaceId =
    typeof payload.activeSpaceId === 'string' && payload.activeSpaceId.trim()
      ? payload.activeSpaceId
      : spaces[0]?.id ?? 'main'
  const settings = sanitizeSettingsPayload((payload.settings as Partial<AppSettingsPayload> | undefined) ?? {})
  const warnings: string[] = []

  const normalizedSpaces = await normalizeSpacesIconsForExport(spaces, warnings)
  const icons = collectExportIcons(normalizedSpaces)
  const iconAssets = await readIconsAsBase64(icons, warnings)

  return {
    version: LAUNEY_EXPORT_VERSION,
    app: 'Launey',
    exportedAt: new Date().toISOString(),
    settings,
    spaces: normalizedSpaces,
    activeSpaceId,
    assets: {
      icons: iconAssets,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

async function applyLauneyImport(filePayload: unknown) {
  const parsed = validateLauneyImport(filePayload)
  const restoredIcons = await restoreIconAssets(parsed.assets?.icons ?? {})
  const settings = sanitizeSettingsPayload(parsed.settings)
  writeSettingsFile(settings)

  return {
    ok: true,
    spaces: parsed.spaces,
    activeSpaceId: parsed.activeSpaceId,
    settings,
    restoredIcons,
    warnings: parsed.warnings ?? [],
  }
}

function validateLauneyImport(value: unknown): LauneyExportPayload {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid import payload')
  }

  const payload = value as Partial<LauneyExportPayload>

  if (payload.app !== 'Launey') {
    throw new Error('Invalid import payload')
  }

  if (typeof payload.version !== 'number') {
    throw new Error('Invalid import payload')
  }

  if (!Array.isArray(payload.spaces)) {
    throw new Error('Invalid import payload')
  }

  return {
    version: payload.version,
    app: payload.app,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : new Date().toISOString(),
    settings: sanitizeSettingsPayload((payload.settings as Partial<AppSettingsPayload> | undefined) ?? {}),
    spaces: sanitizeExportSpaces(payload.spaces),
    activeSpaceId:
      typeof payload.activeSpaceId === 'string' && payload.activeSpaceId.trim()
        ? payload.activeSpaceId
        : sanitizeExportSpaces(payload.spaces)[0]?.id ?? 'main',
    assets: {
      icons: payload.assets?.icons ?? {},
    },
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((entry): entry is string => typeof entry === 'string') : [],
  }
}

function sanitizeExportSpaces(value: unknown): ExportSpace[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => sanitizeExportSpace(entry))
    .filter((entry): entry is ExportSpace => entry !== null)
}

function sanitizeExportSpace(value: unknown): ExportSpace | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as Partial<ExportSpace>
  if (typeof payload.id !== 'string' || typeof payload.title !== 'string' || !Array.isArray(payload.items)) {
    return null
  }

  const items = payload.items
    .map((item) => sanitizeExportItem(item))
    .filter((item): item is ExportUrlItem | ExportFolderItem => item !== null)

  return {
    id: payload.id,
    title: payload.title,
    background: payload.background,
    items,
  }
}

function sanitizeExportItem(value: unknown): ExportUrlItem | ExportFolderItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as
    | (Partial<ExportUrlItem> & { type?: 'url' })
    | (Partial<ExportFolderItem> & { type?: 'folder' })
  if (payload.type === 'url') {
    if (
      typeof payload.id !== 'string' ||
      typeof payload.title !== 'string' ||
      typeof payload.url !== 'string'
    ) {
      return null
    }

    return {
      type: 'url',
      id: payload.id,
      title: payload.title,
      url: payload.url,
      icon: typeof payload.icon === 'string' ? payload.icon : '',
      addFrame: typeof payload.addFrame === 'boolean' ? payload.addFrame : true,
      iconCustomization: sanitizeIconCustomization(payload.iconCustomization),
      restoreOrigin:
        payload.restoreOrigin &&
        typeof payload.restoreOrigin === 'object' &&
        typeof payload.restoreOrigin.spaceId === 'string' &&
        typeof payload.restoreOrigin.tileIndex === 'number'
          ? {
              spaceId: payload.restoreOrigin.spaceId,
              tileIndex: payload.restoreOrigin.tileIndex,
            }
          : undefined,
    }
  }

  if (payload.type === 'folder') {
    if (typeof payload.id !== 'string' || typeof payload.title !== 'string' || !Array.isArray(payload.items)) {
      return null
    }

    const items = payload.items
      .map((item) => sanitizeExportItem(item))
      .filter((item): item is ExportUrlItem => Boolean(item && item.type === 'url'))

    return {
      type: 'folder',
      id: payload.id,
      title: payload.title,
      icon: typeof payload.icon === 'string' ? payload.icon : '',
      items,
    }
  }

  return null
}

function sanitizeIconCustomization(value: unknown): IconCustomization | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const payload = value as Partial<IconCustomization>
  if (
    typeof payload.scale !== 'number' ||
    typeof payload.hasBackground !== 'boolean' ||
    typeof payload.backgroundColor !== 'string'
  ) {
    return undefined
  }

  return {
    scale: Math.min(120, Math.max(50, payload.scale)),
    hasBackground: payload.hasBackground,
    backgroundColor: /^#[0-9a-fA-F]{6}$/.test(payload.backgroundColor) ? payload.backgroundColor : '#00FFF4',
    volumeAlpha: clampNumber(payload.volumeAlpha, 0, 100, 40),
    volumePlacement: payload.volumePlacement === 'below' || payload.volumePlacement === 'above' ? payload.volumePlacement : 'above',
    edgeAlpha: clampNumber(payload.edgeAlpha, 0, 100, 100),
    edgeThickness: clampDecimal(payload.edgeThickness, 0, 3, 2, 1),
  }
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

async function normalizeSpacesIconsForExport(spaces: ExportSpace[], warnings: string[]) {
  const normalizedSpaces: ExportSpace[] = []

  for (const space of spaces) {
    const items: Array<ExportUrlItem | ExportFolderItem> = []

    for (const item of space.items) {
      if (item.type === 'url') {
        items.push({
          ...item,
          icon: await normalizeExportIcon(item.icon, warnings),
        })
        continue
      }

      items.push({
        ...item,
        icon: await normalizeExportIcon(item.icon ?? '', warnings),
        items: await Promise.all(
          item.items.map(async (folderItem) => ({
            ...folderItem,
            icon: await normalizeExportIcon(folderItem.icon, warnings),
          })),
        ),
      })
    }

    normalizedSpaces.push({ ...space, items })
  }

  return normalizedSpaces
}

async function normalizeExportIcon(icon: string, warnings: string[]) {
  const trimmed = icon.trim()
  if (!trimmed || trimmed.startsWith('blob:')) {
    return ''
  }

  if (trimmed.startsWith(ICON_PATH_PREFIX) || trimmed.startsWith(ICON_CACHE_PATH_PREFIX)) {
    return trimmed
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/')) {
    try {
      return await cacheRemoteIconFile(trimmed)
    } catch {
      warnings.push(`Не удалось закешировать remote icon: ${trimmed}`)
      return trimmed
    }
  }

  return trimmed
}

function collectExportIcons(spaces: ExportSpace[]) {
  const icons = new Set<string>()

  for (const space of spaces) {
    for (const item of space.items) {
      if (item.type === 'url') {
        if (item.icon.startsWith(ICON_PATH_PREFIX) || item.icon.startsWith(ICON_CACHE_PATH_PREFIX)) {
          icons.add(item.icon)
        }
        continue
      }

      if (item.icon && (item.icon.startsWith(ICON_PATH_PREFIX) || item.icon.startsWith(ICON_CACHE_PATH_PREFIX))) {
        icons.add(item.icon)
      }

      for (const folderItem of item.items) {
        if (folderItem.icon.startsWith(ICON_PATH_PREFIX) || folderItem.icon.startsWith(ICON_CACHE_PATH_PREFIX)) {
          icons.add(folderItem.icon)
        }
      }
    }
  }

  return icons
}

async function readIconsAsBase64(iconPaths: Set<string>, warnings: string[]) {
  const result: Record<string, { mimeType: string; data: string }> = {}

  for (const iconPath of iconPaths) {
    const localPath = toIconFsPath(iconPath)
    if (!localPath || !existsSync(localPath)) {
      warnings.push(`Файл иконки не найден: ${iconPath}`)
      continue
    }

    try {
      const buffer = readFileSync(localPath)
      const mimeType = getMimeTypeFromExtension(extname(localPath).toLowerCase())
      result[iconPath] = {
        mimeType,
        data: buffer.toString('base64'),
      }
    } catch {
      warnings.push(`Не удалось прочитать иконку: ${iconPath}`)
    }
  }

  return result
}

async function restoreIconAssets(icons: Record<string, { mimeType: string; data: string }>) {
  let restored = 0

  for (const [iconPath, payload] of Object.entries(icons)) {
    const targetPath = toIconFsPath(iconPath)
    if (!targetPath) {
      continue
    }

    mkdirSync(dirname(targetPath), { recursive: true })
    const bytes = Buffer.from(payload.data, 'base64')
    writeFileSync(targetPath, bytes)
    restored += 1
  }

  return restored
}

function toIconFsPath(iconPath: string) {
  if (iconPath.startsWith(ICON_PATH_PREFIX)) {
    const fileName = iconPath.slice(ICON_PATH_PREFIX.length)
    if (!fileName || fileName.includes('..')) {
      return null
    }
    return resolve(ICONS_PUBLIC_DIR, fileName)
  }

  if (iconPath.startsWith(ICON_CACHE_PATH_PREFIX)) {
    const fileName = iconPath.slice(ICON_CACHE_PATH_PREFIX.length)
    if (!fileName || fileName.includes('..')) {
      return null
    }
    return resolve(ICON_CACHE_PUBLIC_DIR, fileName)
  }

  return null
}

function getMimeTypeFromExtension(extension: string) {
  switch (extension) {
    case '.webp':
      return 'image/webp'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    case '.bmp':
      return 'image/bmp'
    case '.avif':
      return 'image/avif'
    default:
      return 'application/octet-stream'
  }
}

function sendFileJson(res: ServerResponse, fileName: string, payload: unknown) {
  const body = `${JSON.stringify(payload, null, 2)}\n`
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.end(body)
}

function decodeDataImageUrl(value: string) {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;,]+)?(?:;(base64))?,(.+)$/i)

  if (!match) {
    throw new Error('Failed to download remote icon')
  }

  const [, contentType, encodingFlag, payload] = match

  return {
    contentType,
    buffer:
      encodingFlag === 'base64'
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf8'),
  }
}

function ensureSettingsFile(): AppSettingsPayload {
  mkdirSync(SETTINGS_DATA_DIR, { recursive: true })

  if (!existsSync(SETTINGS_FILE)) {
    writeSettingsFile(DEFAULT_APP_SETTINGS)
    return { ...DEFAULT_APP_SETTINGS }
  }

  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettingsPayload>
    const sanitized = sanitizeSettingsPayload(parsed)
    writeSettingsFile(sanitized)
    return sanitized
  } catch {
    writeSettingsFile(DEFAULT_APP_SETTINGS)
    return { ...DEFAULT_APP_SETTINGS }
  }
}

function writeSettingsFile(settings: AppSettingsPayload) {
  mkdirSync(SETTINGS_DATA_DIR, { recursive: true })
  writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

function sanitizeSettingsPayload(payload: Partial<AppSettingsPayload>): AppSettingsPayload {
  if (typeof payload.weatherLocation !== 'string') {
    throw new Error('Invalid settings payload')
  }

  return {
    appearanceTheme: normalizeAppearanceTheme(payload.appearanceTheme),
    backgroundBlur: normalizeSettingNumber(payload.backgroundBlur),
    backgroundDim: normalizeSettingNumber(payload.backgroundDim),
    weatherLocation: payload.weatherLocation.trim() || DEFAULT_APP_SETTINGS.weatherLocation,
    background: normalizeBackground(payload.background),
  }
}

function normalizeAppearanceTheme(value: AppSettingsPayload['appearanceTheme'] | undefined) {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_APP_SETTINGS.appearanceTheme
}

function normalizeSettingNumber(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error('Invalid settings payload')
  }

  return Math.max(0, Math.min(100, value))
}

function normalizeBackground(value: Partial<AppSettingsPayload['background']> | undefined): AppSettingsPayload['background'] {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_APP_SETTINGS.background }
  }

  const type = typeof value.type === 'string' ? value.type : 'default'
  const backgroundValue =
    'value' in value && typeof value.value === 'string' && value.value.trim() ? value.value.trim() : ''

  if (type === 'default') {
    return { type: 'default' }
  }

  if (
    (type === 'image-url' ||
      type === 'video-url' ||
      type === 'local-image' ||
      type === 'local-video') &&
    backgroundValue
  ) {
    if (type === 'local-image' || type === 'local-video') {
      const normalizedLocalBackground: Extract<
        AppSettingsPayload['background'],
        { type: 'local-image' | 'local-video' }
      > = { type, value: backgroundValue }

      if ('fileName' in value && typeof value.fileName === 'string' && value.fileName.trim()) {
        return { ...normalizedLocalBackground, fileName: value.fileName.trim() }
      }

      return normalizedLocalBackground
    }

    return { type, value: backgroundValue }
  }

  return { ...DEFAULT_APP_SETTINGS.background }
}

function readRequestBody(req: IncomingMessage) {
  return new Promise<Buffer>((resolvePromise, reject) => {
    const chunks: Buffer[] = []

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    req.on('end', () => {
      resolvePromise(Buffer.concat(chunks))
    })

    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}
