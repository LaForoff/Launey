import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { domainToASCII } from 'node:url'

const MINUTE = 60_000
const MAX_ENTRIES = 200
const MAX_METADATA_BYTES = 512 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const CACHE_FILE = 'anylogo-cache.json'
// Observed Pubrio neutral building response for an unknown brand (2026-11-14).
const PUBRIO_PLACEHOLDER_SHA256 = '60dd26ecb0a70ae7cd7737c82d53cb6b6f8bef8b97e1ce0ad3b34b22e5b20966'
type Shape = 'icon' | 'wordmark'
type Provider = 'anylogo' | 'pubrio' | 'debounce'
type BudgetKey = 'metadata' | 'imageGlobal' | `image:${Provider}`
const PROVIDERS = {
  anylogo: { name: 'AnyLogo', host: 'img.anylogo.dev' },
  pubrio: { name: 'Pubrio', host: 'logo.pubrio.com' },
  debounce: { name: 'DeBounce', host: 'logo.debounce.com' },
} as const
const BUDGETS: Record<BudgetKey, number> = { metadata: 15, imageGlobal: 60, 'image:anylogo': 40, 'image:pubrio': 30, 'image:debounce': 30 }
type Suggestion = { name: string; domain: string }
type Variant = { shape: Shape; width?: number; height?: number; scalable?: boolean }
type Payload = { ok: true; suggestions: Suggestion[] } | { ok: true; variants: Variant[] } | { ok: true; localIcon: string } | { ok: false; error: string; retryAfterSeconds?: number }
type Result = { status: number; payload: Payload }
type CacheEntry = { expiresAt: number; touchedAt: number; result: Result }
type Options = { rootDir?: string; fetch?: typeof fetch; now?: () => number }

class AnyLogoError extends Error {
  status: number
  retryAfterSeconds?: number
  constructor(message: string, status = 502, retryAfterSeconds?: number) {
    super(message)
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Public DNS names only. The supplied domain is an opaque path component, never a fetch host. */
export function normalizeBrandDomain(value: string): string | null {
  if (value.length > 253 || value !== value.trim() || /[\s/:@?#\\%]/.test(value)) return null
  const domain = domainToASCII(value).toLowerCase()
  const labels = domain.split('.')
  if (isIP(domain) || labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  const tld = labels.at(-1)!
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) return null
  if (['localhost', 'local', 'internal', 'test', 'invalid', 'example', 'onion', 'home', 'lan'].includes(tld)) return null
  return domain
}

export function createAnyLogoService(options: Options = {}) {
  const rootDir = options.rootDir ?? process.cwd()
  const dataDir = resolve(rootDir, 'data')
  const imageDir = resolve(rootDir, 'public/icon-cache')
  const cacheFile = resolve(dataDir, CACHE_FILE)
  const fetchImpl = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const cache = new Map<string, CacheEntry>()
  const inFlight = new Map<string, Promise<Result>>()
  const usage: Record<BudgetKey, number[]> = { metadata: [], imageGlobal: [], 'image:anylogo': [], 'image:pubrio': [], 'image:debounce': [] }
  const cooldowns: Record<Provider, number> = { anylogo: 0, pubrio: 0, debounce: 0 }
  let active = 0
  const waiters: Array<() => void> = []

  // Corrupt/oversized cache files are ignored. Images remain immutable export assets.
  try {
    const bytes = readFileSync(cacheFile)
    if (bytes.length <= 2 * 1024 * 1024) {
      const disk = JSON.parse(bytes.toString('utf8')) as { entries?: unknown; cooldownUntil?: unknown; cooldowns?: unknown }
      if (typeof disk.cooldownUntil === 'number' && Number.isFinite(disk.cooldownUntil)) cooldowns.anylogo = disk.cooldownUntil
      const persistedCooldowns = record(disk.cooldowns)
      for (const provider of Object.keys(PROVIDERS) as Provider[]) {
        const timestamp = persistedCooldowns?.[provider]
        if (typeof timestamp === 'number' && Number.isFinite(timestamp)) cooldowns[provider] = Math.max(cooldowns[provider], timestamp)
      }
      if (Array.isArray(disk.entries)) {
        for (const pair of disk.entries.slice(-MAX_ENTRIES)) {
          if (!Array.isArray(pair) || pair.length !== 2) continue
          const [key, entry] = pair as [unknown, unknown]
          if (typeof key !== 'string' || !/^(search|kit|image):/.test(key) || !isCacheEntry(entry)) continue
          // Before providers existed, image keys contained only domain and variant.
          const migratedKey = /^image:[^:]+:(?:icon|wordmark)$/.test(key) ? key.replace('image:', 'image:anylogo:') : key
          if (entry.expiresAt > now()) cache.set(migratedKey, entry)
        }
      }
    }
  } catch { /* First run or incomplete cache: fetch on demand. */ }

  function persist() {
    mkdirSync(dataDir, { recursive: true })
    const temp = `${cacheFile}.${randomUUID()}.tmp`
    writeFileSync(temp, JSON.stringify({ entries: [...cache], cooldownUntil: cooldowns.anylogo, cooldowns }))
    renameSync(temp, cacheFile)
  }

  function put(key: string, result: Result, ttl: number) {
    const timestamp = now()
    cache.delete(key)
    cache.set(key, { expiresAt: ttl === Infinity ? Number.MAX_SAFE_INTEGER : timestamp + ttl, touchedAt: timestamp, result })
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
    persist()
  }

  function cached(key: string): Result | undefined {
    const entry = cache.get(key)
    if (!entry) return
    if (entry.expiresAt <= now()) { cache.delete(key); return }
    if (entry.result.payload.ok && 'localIcon' in entry.result.payload && entry.result.payload.localIcon.startsWith(`/icon-cache/pubrio-${PUBRIO_PLACEHOLDER_SHA256}.`)) {
      const missing: Result = { status: 404, payload: { ok: false, error: 'Logo not found' } }
      put(key, missing, 60 * MINUTE)
      return missing
    }
    if (entry.result.payload.ok && 'localIcon' in entry.result.payload && !existsSync(resolve(imageDir, entry.result.payload.localIcon.slice('/icon-cache/'.length)))) {
      cache.delete(key)
      return
    }
    cache.delete(key)
    cache.set(key, { ...entry, touchedAt: now() })
    return entry.result
  }

  async function singleFlight(key: string, work: () => Promise<{ result: Result; ttl: number }>): Promise<Result> {
    const hit = cached(key)
    if (hit) return hit
    const pending = inFlight.get(key)
    if (pending) return pending
    const task = (async () => {
      try {
        const { result, ttl } = await work()
        put(key, result, ttl)
        return result
      } catch (error) {
        const failure = error instanceof AnyLogoError ? error : new AnyLogoError('Logo provider is temporarily unavailable')
        const result: Result = { status: failure.status, payload: { ok: false, error: failure.message, ...(failure.retryAfterSeconds ? { retryAfterSeconds: failure.retryAfterSeconds } : {}) } }
        // Local budgets/cooldowns must not occupy the metadata cache or suppress a later cache hit.
        if (failure.status !== 429) put(key, result, 30_000)
        return result
      } finally { inFlight.delete(key) }
    })()
    inFlight.set(key, task)
    return task
  }

  function budgetKeys(kind: 'metadata' | 'image', provider: Provider): BudgetKey[] {
    return kind === 'metadata' ? ['metadata'] : [`image:${provider}`, 'imageGlobal']
  }

  function checkBudget(kind: 'metadata' | 'image', provider: Provider) {
    const timestamp = now()
    const name = PROVIDERS[provider].name
    if (cooldowns[provider] > timestamp) throw new AnyLogoError(`${name} is cooling down`, 429, Math.max(1, Math.ceil((cooldowns[provider] - timestamp) / 1000)))
    for (const key of budgetKeys(kind, provider)) {
      usage[key] = usage[key].filter((time) => time > timestamp - MINUTE)
      if (usage[key].length >= BUDGETS[key]) throw new AnyLogoError(key === 'imageGlobal' ? 'Logo image request limit reached' : `${name} request limit reached`, 429, Math.max(1, Math.ceil((usage[key][0] + MINUTE - timestamp) / 1000)))
    }
  }

  async function upstream(url: string, kind: 'metadata' | 'image', provider: Provider = 'anylogo'): Promise<Buffer | null> {
    checkBudget(kind, provider)
    if (active >= 3) {
      if (waiters.length >= 32) throw new AnyLogoError('Logo providers are busy', 429, 1)
      await new Promise<void>((done) => waiters.push(done))
    } else active += 1
    try {
      checkBudget(kind, provider)
      for (const key of budgetKeys(kind, provider)) usage[key].push(now())
      const expectedHost = kind === 'image' ? PROVIDERS[provider].host : 'api.anylogo.dev'
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost || parsed.port || parsed.username || parsed.password) throw new AnyLogoError('Invalid AnyLogo destination')
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Accept: kind === 'metadata' ? 'application/json' : 'image/svg+xml,image/png,image/jpeg,image/webp' } })
      // Do not follow redirects, including redirects to a second nominally allowlisted host.
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new AnyLogoError('AnyLogo returned an unsupported redirect') }
      if (response.status === 429 || response.status === 503) {
        const retry = parseRetryAfter(response.headers.get('retry-after'), now())
        if (response.status === 429 || response.headers.has('retry-after')) {
          cooldowns[provider] = Math.max(cooldowns[provider], now() + retry * 1000)
          persist()
          await response.body?.cancel()
          throw new AnyLogoError(`${PROVIDERS[provider].name} request limit reached`, 429, retry)
        }
      }
      if (response.status === 404 || kind === 'image' && isFallbackResponse(response.headers)) { await response.body?.cancel(); return null }
      if (!response.ok) { await response.body?.cancel(); throw new AnyLogoError('Logo provider is temporarily unavailable') }
      if (response.url) {
        const finalUrl = new URL(response.url)
        if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== expectedHost || finalUrl.port) { await response.body?.cancel(); throw new AnyLogoError('Invalid AnyLogo response origin') }
      }
      return await readBounded(response, kind === 'metadata' ? MAX_METADATA_BYTES : MAX_IMAGE_BYTES)
    } finally {
      const next = waiters.shift()
      if (next) next()
      else active -= 1
    }
  }

  async function request(rawUrl: string, method = 'GET'): Promise<Result | null> {
    const url = new URL(rawUrl, 'http://localhost')
    if (!['/api/brand-search', '/api/brand-kit', '/api/brand-image'].includes(url.pathname)) return null
    if (method !== 'GET') return { status: 405, payload: { ok: false, error: 'Method not allowed' } }
    if (url.pathname === '/api/brand-search') {
      const query = (url.searchParams.get('query') ?? '').trim().replace(/\s+/g, ' ')
      if (query.length < 2 || query.length > 80 || hasControlCharacters(query)) return { status: 400, payload: { ok: false, error: 'Search query must contain 2–80 characters' } }
      return singleFlight(`search:${query.toLowerCase()}`, async () => {
        const bytes = await upstream(`https://api.anylogo.dev/search?q=${encodeURIComponent(query)}`, 'metadata')
        const suggestions = bytes?.length ? parseSearch(parseMetadata(bytes)) : []
        return { result: { status: 200, payload: { ok: true, suggestions } }, ttl: bytes === null ? 60 * MINUTE : suggestions.length ? 24 * 60 * MINUTE : 15 * MINUTE }
      })
    }
    const domain = normalizeBrandDomain(url.searchParams.get('domain') ?? '')
    if (!domain) return { status: 400, payload: { ok: false, error: 'Invalid public domain' } }
    if (url.pathname === '/api/brand-kit') {
      return singleFlight(`kit:${domain}`, async () => {
        const bytes = await upstream(`https://api.anylogo.dev/kit/${encodeURIComponent(domain)}`, 'metadata')
        const variants = bytes?.length ? parseKit(parseMetadata(bytes)) : []
        return { result: { status: 200, payload: { ok: true, variants } }, ttl: variants.length ? 7 * 24 * 60 * MINUTE : 60 * MINUTE }
      })
    }
    const rawProvider = url.searchParams.get('provider') ?? 'anylogo'
    if (rawProvider !== 'anylogo' && rawProvider !== 'pubrio' && rawProvider !== 'debounce') return { status: 400, payload: { ok: false, error: 'Invalid logo provider' } }
    const provider: Provider = rawProvider
    const variant = url.searchParams.get('variant')
    if (variant !== 'icon' && variant !== 'wordmark') return { status: 400, payload: { ok: false, error: 'Invalid logo variant' } }
    if (provider !== 'anylogo' && variant !== 'icon') return { status: 400, payload: { ok: false, error: 'This provider supports icons only' } }
    return singleFlight(`image:${provider}:${domain}:${variant}`, async () => {
      const imageUrl = provider === 'anylogo'
        ? `https://img.anylogo.dev/${encodeURIComponent(domain)}?variant=${variant}`
        : `https://${PROVIDERS[provider].host}/${encodeURIComponent(domain)}`
      const bytes = await upstream(imageUrl, 'image', provider)
      if (!bytes?.length) return { result: { status: 404, payload: { ok: false, error: 'Logo not found' } }, ttl: 60 * MINUTE }
      const hash = createHash('sha256').update(bytes).digest('hex')
      if (provider === 'pubrio' && hash === PUBRIO_PLACEHOLDER_SHA256) return { result: { status: 404, payload: { ok: false, error: 'Logo not found' } }, ttl: 60 * MINUTE }
      const extension = validateBrandImage(bytes)
      const name = `${provider}-${hash}.${extension}`
      mkdirSync(imageDir, { recursive: true })
      const target = resolve(imageDir, name)
      if (!existsSync(target)) {
        const temp = `${target}.${randomUUID()}.tmp`
        writeFileSync(temp, bytes)
        renameSync(temp, target)
      }
      return { result: { status: 200, payload: { ok: true, localIcon: `/icon-cache/${name}` } }, ttl: Infinity }
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    let result: Result | null
    try { result = await request(req.url ?? '/', req.method) }
    catch { result = { status: 502, payload: { ok: false, error: 'Logo provider is temporarily unavailable' } } }
    if (!result) return false
    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    if (!result.payload.ok && result.payload.retryAfterSeconds) res.setHeader('Retry-After', String(result.payload.retryAfterSeconds))
    res.end(JSON.stringify(result.payload))
    return true
  }
  function handleAsset(req: IncomingMessage, res: ServerResponse): boolean {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const match = path.match(/^\/icon-cache\/((?:anylogo|pubrio|debounce)-([a-f0-9]{64})\.(png|jpg|webp|svg))$/)
    if (!match) return false
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return true }
    try {
      // Serve immediately, without waiting for Vite's asynchronous public-file watcher.
      const bytes = readFileSync(resolve(imageDir, match[1]))
      const etag = `"${match[2]}"`
      res.setHeader('ETag', etag)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      if (req.headers['if-none-match'] === etag) { res.statusCode = 304; res.end(); return true }
      const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }
      res.setHeader('Content-Type', mime[match[3]])
      res.setHeader('Content-Length', bytes.length)
      res.statusCode = 200
      res.end(req.method === 'HEAD' ? undefined : bytes)
    } catch {
      res.statusCode = 404
      res.setHeader('Cache-Control', 'no-store')
      res.end()
    }
    return true
  }
  return { request, handle, handleAsset }
}

function isFallbackResponse(headers: Headers): boolean {
  return ['x-anylogo-fallback', 'x-logo-fallback', 'x-placeholder', 'x-logo-placeholder', 'x-fallback'].some((name) => /^(?:1|true|yes|monogram|transparent|placeholder|not-found|missing|fallback)$/i.test(headers.get(name)?.trim() ?? ''))
    || /^(?:not-found|missing|fallback)$/i.test(headers.get('x-logo-status')?.trim() ?? '')
}

function parseRetryAfter(value: string | null, now: number): number {
  if (value && /^\d+$/.test(value)) return Math.max(1, Math.min(86400, Number(value)))
  const date = value ? Date.parse(value) : NaN
  return Number.isFinite(date) ? Math.max(1, Math.min(86400, Math.ceil((date - now) / 1000))) : 60
}

async function readBounded(response: Response, limit: number): Promise<Buffer> {
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) { await response.body?.cancel(); throw new AnyLogoError('AnyLogo response is too large') }
  if (!response.body) throw new AnyLogoError('Empty AnyLogo response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new AnyLogoError('AnyLogo response is too large')
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  return Buffer.concat(chunks, length)
}

function parseMetadata(bytes: Buffer): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw new AnyLogoError('Invalid AnyLogo metadata') }
}
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }

function parseSearch(payload: unknown): Suggestion[] {
  const object = record(payload)
  const entries = object?.suggestions
  if (!Array.isArray(entries)) throw new AnyLogoError('Invalid AnyLogo search results')
  const seen = new Set<string>()
  const suggestions: Suggestion[] = []
  for (const entry of entries.slice(0, 100)) {
    const item = record(entry)
    if (!item || typeof item.domain !== 'string') continue
    const domain = normalizeBrandDomain(item.domain)
    if (!domain || seen.has(domain)) continue
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 120) : domain
    if (!name || hasControlCharacters(name)) continue
    seen.add(domain)
    suggestions.push({ name, domain })
    if (suggestions.length === 12) break
  }
  return suggestions
}

function parseKit(payload: unknown): Variant[] {
  const object = record(payload)
  const entries = object?.variants
  if (!Array.isArray(entries)) throw new AnyLogoError('Invalid AnyLogo brand kit')
  const variants = new Map<Shape, Variant>()
  for (const entry of entries.slice(0, 100)) {
    const item = record(entry)
    const shape = item?.shape
    if (shape !== 'icon' && shape !== 'wordmark') continue
    const variant: Variant = { shape }
    if (typeof item?.width === 'number' && Number.isFinite(item.width) && item.width > 0 && item.width <= 4096) variant.width = item.width
    if (typeof item?.height === 'number' && Number.isFinite(item.height) && item.height > 0 && item.height <= 4096) variant.height = item.height
    if (typeof item?.scalable === 'boolean') variant.scalable = item.scalable
    if (!variants.has(shape)) variants.set(shape, variant)
  }
  return [...variants.values()]
}

function isCacheEntry(value: unknown): value is CacheEntry {
  const item = record(value)
  const result = record(item?.result)
  const payload = record(result?.payload)
  if (!item || !result || !payload || typeof item.expiresAt !== 'number' || !Number.isFinite(item.expiresAt) || typeof item.touchedAt !== 'number' || !Number.isFinite(item.touchedAt) || typeof result.status !== 'number') return false
  if (payload.ok === false) return typeof payload.error === 'string' && payload.error.length <= 200 && result.status >= 400 && result.status <= 599
  if (payload.ok !== true || result.status !== 200) return false
  if (typeof payload.localIcon === 'string') return /^\/icon-cache\/(?:anylogo|pubrio|debounce)-[a-f0-9]{64}\.(png|svg|jpg|webp)$/.test(payload.localIcon)
  try {
    if (Array.isArray(payload.suggestions)) return JSON.stringify(parseSearch(payload)) === JSON.stringify(payload.suggestions)
    if (Array.isArray(payload.variants)) return JSON.stringify(parseKit(payload)) === JSON.stringify(payload.variants)
  } catch { return false }
  return false
}

function validDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) throw new AnyLogoError('Invalid or oversized logo dimensions')
}

/** Sniff supported raster headers; the client also decodes before offering selection. */
export function validateBrandImage(bytes: Buffer): 'png' | 'jpg' | 'webp' | 'svg' {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new AnyLogoError('Invalid logo image')
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(8) === 13) {
    validDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20))
    return 'png'
  }
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xd9 || marker === 0xda) break
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
      if (offset + 2 > bytes.length) break
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        validDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3))
        return 'jpg'
      }
      offset += length
    }
    throw new AnyLogoError('Invalid JPEG logo')
  }
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const format = bytes.toString('ascii', 12, 16)
    let width: number, height: number
    if (format === 'VP8X' && bytes.readUInt32LE(16) >= 10) {
      // Animation is unnecessary for brand logos and can multiply decode memory.
      if (bytes[20] & 2) throw new AnyLogoError('Animated logos are unsupported')
      width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3)
    } else if (format === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff
    } else if (format === 'VP8L' && bytes[20] === 0x2f) {
      width = 1 + (bytes.readUInt32LE(21) & 0x3fff); height = 1 + ((bytes.readUInt32LE(21) >>> 14) & 0x3fff)
    } else throw new AnyLogoError('Invalid WebP logo')
    validDimensions(width, height)
    return 'webp'
  }
  let svg: string
  try { svg = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new AnyLogoError('Unsupported logo format') }
  validateSvg(svg)
  return 'svg'
}

const SVG_TAGS = new Set('svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask title desc use symbol style'.split(' '))
const SVG_ATTRIBUTES = new Set('xmlns xmlns:xlink id class style type viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity transform gradientTransform gradientUnits offset stop-color stop-opacity clip-path clip-rule mask mask-type maskUnits maskContentUnits preserveAspectRatio spreadMethod fx fy fr href xlink:href color role aria-label focusable'.split(' '))

/** Conservative XML subset with presentation-only CSS and no external resources or entities. */
function validateSvg(source: string) {
  const fail = () => { throw new AnyLogoError('Unsafe or invalid SVG logo') }
  const svg = source.replace(/^\uFEFF/, '').replace(/^\s*<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>/i, '')
  if (/<[!?]/.test(svg.replace(/<!--[\s\S]*?-->/g, '')) || /&/.test(svg)) fail()
  const stack: string[] = []
  let position = 0, roots = 0, tokens = 0
  const token = /<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>|[^<]+/g
  for (const match of svg.matchAll(token)) {
    if (match.index !== position || ++tokens > 50000) fail()
    position = match.index + match[0].length
    const text = match[0]
    if (text.startsWith('<!--')) { if (text.slice(4, -3).includes('--')) fail(); continue }
    if (!text.startsWith('<')) {
      if (stack.at(-1) === 'style') validateSvgStylesheet(text)
      else if (text.trim() && !['title', 'desc'].includes(stack.at(-1) ?? '')) fail()
      continue
    }
    const closing = /^<\//.test(text)
    const tagMatch = text.match(/^<\/?([A-Za-z][A-Za-z0-9]*)/)
    if (!tagMatch) fail()
    const tag = tagMatch![1]
    if (!SVG_TAGS.has(tag)) fail()
    if (closing) {
      if (text !== `</${tag}>` || stack.pop() !== tag) fail()
      continue
    }
    const selfClosing = text.endsWith('/>')
    const attributes = text.slice(tag.length + 1, selfClosing ? -2 : -1)
    let cursor = 0
    const seen = new Set<string>()
    const attribute = /\s+([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g
    for (const attributeMatch of attributes.matchAll(attribute)) {
      if (attributeMatch.index !== cursor) fail()
      cursor = attributeMatch.index + attributeMatch[0].length
      const name = attributeMatch[1], value = attributeMatch[2] ?? attributeMatch[3]
      if (!SVG_ATTRIBUTES.has(name) || seen.has(name) || (hasControlCharacters(value.replace(/[\t\r\n]/g, '')) || value.includes('\\'))) fail()
      seen.add(name)
      if (name === 'type' && (tag !== 'style' || value !== 'text/css')) fail()
      if (name === 'style') validateSvgDeclarations(value)
      if (name === 'xmlns' && value !== 'http://www.w3.org/2000/svg') fail()
      if (name === 'xmlns:xlink' && value !== 'http://www.w3.org/1999/xlink') fail()
      if (name === 'href' || name === 'xlink:href') { if (!/^#[A-Za-z_][\w.-]*$/.test(value)) fail() }
      else if (name !== 'xmlns' && name !== 'xmlns:xlink' && name !== 'style') {
        if (/[<>&]/.test(value) || /(?:javascript|data|https?|file):|\/\//i.test(value)) fail()
        validateSvgResourceValue(name, value)
      }
      if ((name === 'width' || name === 'height') && !/^\d+(?:\.\d+)?(?:px|%)?$/.test(value)) fail()
      if ((name === 'width' || name === 'height') && (parseFloat(value) <= 0 || parseFloat(value) > 4096)) fail()
    }
    if (attributes.slice(cursor).trim()) fail()
    if (!stack.length) { if (tag !== 'svg' || ++roots !== 1) fail() }
    if (!selfClosing) stack.push(tag)
    if (stack.length > 64) fail()
  }
  if (position !== svg.length || stack.length || roots !== 1) fail()
}


function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}

const SVG_STYLE_PROPERTIES = new Set('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity stop-color stop-opacity clip-path clip-rule mask mask-type color'.split(' '))
function validateSvgDeclarations(source: string) {
  for (const raw of source.split(';')) {
    const declaration = raw.trim()
    if (!declaration) continue
    const match = declaration.match(/^([a-z-]+)\s*:\s*(.+)$/i)
    if (!match || !SVG_STYLE_PROPERTIES.has(match[1].toLowerCase())) throw new AnyLogoError('Unsafe SVG styles')
    const value = match[2].replace(/\s*!important\s*$/i, '').trim()
    if (hasControlCharacters(value.replace(/[\t\r\n]/g, '')) || /[\\<>&{}@]|(?:javascript|data|https?|file):|\/\/|\/\*/i.test(value)) throw new AnyLogoError('Unsafe SVG styles')
    validateSvgResourceValue(match[1].toLowerCase(), value)
  }
}

function validateSvgStylesheet(source: string) {
  let cursor = 0
  const selector = '(?:[.#][A-Za-z_][\\w-]*|svg|g|path|rect|circle|ellipse|line|polyline|polygon|stop)'
  const safeSelector = new RegExp(`^${selector}(?:\\s*,\\s*${selector})*$`)
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (source.slice(cursor, rule.index).trim() || !safeSelector.test(rule[1].trim())) throw new AnyLogoError('Unsafe SVG stylesheet')
    validateSvgDeclarations(rule[2])
    cursor = rule.index + rule[0].length
  }
  if (source.slice(cursor).trim()) throw new AnyLogoError('Unsafe SVG stylesheet')
}

function validateSvgResourceValue(name: string, value: string) {
  if (name === 'mask-type' && value !== 'luminance' && value !== 'alpha') throw new AnyLogoError('Unsupported SVG mask type')
  const localUrl = /^url\(\s*#[A-Za-z_][\w.-]*\s*\)$/i.test(value)
  if (/url/i.test(value) && !localUrl) throw new AnyLogoError('External SVG resource')
  if ((name === 'mask' || name === 'clip-path') && value !== 'none' && !localUrl) throw new AnyLogoError('Unsupported SVG reference')
}
