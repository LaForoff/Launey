import { getDomain, parse } from 'tldts'

export type BrandVariant = 'icon' | 'wordmark'
export type LogoProvider = 'pubrio' | 'debounce' | 'anylogo'
export const LOGO_PROVIDERS: LogoProvider[] = ['pubrio', 'debounce', 'anylogo']
export const LOGO_PROVIDER_NAMES: Record<LogoProvider, string> = { pubrio: 'Pubrio', debounce: 'DeBounce', anylogo: 'AnyLogo' }
export function isRemoteBrandIcon(icon: BrandIcon): boolean {
  return icon.provider === 'anylogo' || icon.provider === 'pubrio' || icon.provider === 'debounce'
}
export interface BrandSuggestion { name: string; domain: string }
export interface BrandKitVariant { shape: BrandVariant; width?: number; height?: number; scalable?: boolean }
export interface BrandIcon {
  id: string
  domain: string
  name: string
  shape: BrandVariant
  localIcon: string
  reason: 'domain' | 'product'
  width?: number
  height?: number
  scalable?: boolean
  provider?: LogoProvider | 'simple-icons' | 'svg-logos'
  artwork?: 'original' | 'monochrome'
}

const TECHNICAL_LABELS = new Set(['www', 'www2', 'app', 'apps', 'web', 'portal', 'login', 'auth', 'sso', 'api', 'cdn', 'static', 'assets', 'prod', 'production', 'dev', 'test', 'stage', 'staging', 'internal', 'corp', 'local', 'ru', 'en'])
const PRIVATE_SUFFIXES = /\.(?:localhost|local|internal|test|invalid|example|onion)$/i

export function normalizeBrandQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80)
}

// Verified product identities, not inferred domains. Extend only with an official
// source. DataLens: https://github.com/datalens-tech (links to datalens.tech).
export function getKnownBrand(query: string): BrandSuggestion | undefined {
  const normalized = normalizeBrandQuery(query).toLowerCase()
  if (['datalens', 'yandex datalens', 'яндекс datalens'].includes(normalized)) {
    return { name: 'DataLens', domain: 'datalens.tech' }
  }
  if (normalized === 'gitlab' || normalized === 'git lab') return { name: 'GitLab', domain: 'gitlab.com' }
  if (normalized === 'jetbrains' || normalized === 'jet brains') return { name: 'JetBrains', domain: 'jetbrains.com' }
  // An explicitly entered public domain can bypass incomplete name-search indexes.
  if (!/\s/.test(query) && query.includes('.')) {
    const { domain } = getBrandContext(query, '')
    if (domain) return { name: domain, domain }
  }
}

// A hostname is a search hint, not proof that a particular product is installed.
export function getBrandContext(url: string, title: string) {
  let host = ''
  let domain = ''
  let productHint = ''
  try {
    const parsedURL = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)
    const parsed = parse(parsedURL.hostname, { allowPrivateDomains: true })
    if (['https:', 'http:'].includes(parsedURL.protocol) && !parsed.isIp && (parsed.isIcann || parsed.isPrivate) && !PRIVATE_SUFFIXES.test(parsedURL.hostname)) {
      host = parsedURL.hostname.toLowerCase().replace(/\.$/, '')
      domain = getDomain(host, { allowPrivateDomains: true }) ?? ''
      const subdomain = domain && host.endsWith(`.${domain}`) ? host.slice(0, -domain.length - 1) : ''
      productHint = subdomain.split('.').flatMap((label) => label.split('-'))
        .find((label) => label.length >= 3 && !TECHNICAL_LABELS.has(label) && !/^\d+$/.test(label) && !/^[a-f\d]{12,}$/.test(label)) ?? ''
    }
  } catch { /* Invalid and private URLs can still use explicit product-name search. */ }
  const queries: string[] = []
  for (const value of [title, productHint]) {
    const query = normalizeBrandQuery(value)
    if (query.length < 2 || query.toLowerCase() === domain || query.toLowerCase() === host || query.toLowerCase() === domain.split('.')[0] || queries.some((item) => item.toLowerCase() === query.toLowerCase())) continue
    queries.push(query)
  }
  return { host, domain, productHint, queries: queries.slice(0, 2) }
}

export function getBrandSearchTarget(url: string, title: string, query: string, edited: boolean) {
  const context = getBrandContext(url, title)
  if (!edited) return { ...context, searchQueries: context.queries }
  const input = normalizeBrandQuery(query)
  const explicit = !/\s/.test(input) && input.includes('.') ? getBrandContext(input, '') : null
  if (explicit?.domain) return { ...explicit, searchQueries: explicit.productHint ? [explicit.productHint] : [] }
  return { ...context, searchQueries: input.length >= 2 ? [input] : [] }
}

export class BrandRequestError extends Error {
  retryAfterSeconds?: number
  status?: number
  constructor(message: string, retryAfterSeconds?: number, status?: number) {
    super(message)
    this.retryAfterSeconds = retryAfterSeconds
    this.status = status
  }
}

type Payload = { ok: boolean; suggestions?: BrandSuggestion[]; variants?: BrandKitVariant[]; localIcon?: string; error?: string; retryAfterSeconds?: number }
type Cached = { payload: Payload; expiresAt: number; status?: number }
const cache = new Map<string, Cached>()
const pending = new Map<string, Promise<Payload>>()
const cooldownUntil: Partial<Record<LogoProvider, number>> = {}

function putCache(key: string, entry: Cached) {
  cache.delete(key)
  cache.set(key, entry)
  while (cache.size > 200) cache.delete(cache.keys().next().value!)
}

// Shared requests deliberately outlive an individual consumer. Closing the picker
// prevents follow-up work without making StrictMode or another picker retry it.
async function request(path: string, ttl: number, provider: LogoProvider = 'anylogo'): Promise<Payload> {
  const cached = cache.get(path)
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.payload.ok) throw new BrandRequestError(cached.payload.error ?? 'Не удалось получить иконки', cached.payload.retryAfterSeconds, cached.status)
    return cached.payload
  }
  const existing = pending.get(path)
  if (existing) return existing
  const remaining = (cooldownUntil[provider] ?? 0) - Date.now()
  if (remaining > 0) throw new BrandRequestError('Источник временно приостановил запросы', Math.ceil(remaining / 1000), 429)
  const job = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(path, { signal: controller.signal })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) {
        const seconds = Math.max(1, Math.min(86400, payload.retryAfterSeconds ?? 30))
        if (response.status === 429) cooldownUntil[provider] = Date.now() + seconds * 1000
        const message = response.status === 404 ? 'Логотип не найден' : response.status === 429 ? 'Достигнут лимит запросов. Попробуйте позже.' : 'Не удалось получить вариант из интернет-каталога'
        putCache(path, { payload: { ...payload, ok: false, error: message }, status: response.status, expiresAt: Date.now() + (response.status === 404 ? 60 * 60_000 : seconds * 1000) })
        throw new BrandRequestError(message, payload.retryAfterSeconds, response.status)
      }
      const empty = payload.suggestions?.length === 0 || payload.variants?.length === 0
      putCache(path, { payload, expiresAt: Date.now() + (empty ? 15 * 60_000 : ttl) })
      return payload
    } catch (error) {
      if (error instanceof BrandRequestError) throw error
      putCache(path, { payload: { ok: false, error: 'Нет ответа от каталога иконок' }, expiresAt: Date.now() + 30_000 })
      throw new BrandRequestError('Нет ответа от каталога иконок')
    } finally {
      clearTimeout(timer)
      pending.delete(path)
    }
  })()
  pending.set(path, job)
  return job
}

export async function searchBrands(query: string) {
  return (await request(`/api/brand-search?query=${encodeURIComponent(normalizeBrandQuery(query).toLowerCase())}`, 24 * 60 * 60_000)).suggestions ?? []
}

export async function getBrandKit(domain: string) {
  return (await request(`/api/brand-kit?domain=${encodeURIComponent(domain.toLowerCase())}`, 7 * 24 * 60 * 60_000)).variants ?? []
}

export async function getBrandImage(domain: string, variant: BrandVariant, provider: LogoProvider = 'anylogo') {
  const payload = await request(`/api/brand-image?domain=${encodeURIComponent(domain.toLowerCase())}&variant=${variant}&provider=${provider}`, 7 * 24 * 60 * 60_000, provider)
  const validPath = new RegExp(`^/icon-cache/${provider}-[a-f0-9]{64}\\.(?:png|jpg|webp|svg)$`)
  if (!payload.localIcon || !validPath.test(payload.localIcon)) throw new BrandRequestError('Каталог вернул некорректную иконку')
  return payload.localIcon
}
