import {
  BrandRequestError, LOGO_PROVIDER_NAMES, getBrandImage, getBrandKit, getKnownBrand, searchBrands,
  type BrandIcon, type BrandSuggestion, type BrandVariant, type LogoProvider,
} from './brandIcons.ts'

interface SearchOptions {
  domain: string
  queries: string[]
  isCancelled: () => boolean
  onResult: (icon: BrandIcon) => void
  onError: (message: string) => void
}

/** Fan out independently; an AnyLogo metadata failure cannot suppress the other providers. */
export async function collectRemoteBrandIcons({ domain, queries, isCancelled, onResult, onError }: SearchOptions) {
  const seenDomains = new Set<string>()
  let productCount = 0
  const report = (error: unknown, source: string) => {
    if (isCancelled() || error instanceof BrandRequestError && error.status === 404) return
    onError(`${source}: ${error instanceof Error ? error.message : 'Не удалось получить иконки'}`)
  }
  const loadImage = async (suggestion: BrandSuggestion, reason: BrandIcon['reason'], provider: LogoProvider, shape: BrandVariant, dimensions: Partial<BrandIcon> = {}) => {
    if (isCancelled()) return
    try {
      const localIcon = await getBrandImage(suggestion.domain, shape, provider)
      if (isCancelled()) return
      // Result identity is the provider request, never a content/perceptual hash.
      onResult({ ...dimensions, id: `${provider}:${suggestion.domain}:${shape}`, ...suggestion, shape, localIcon, reason, provider })
    } catch (error) { report(error, `${LOGO_PROVIDER_NAMES[provider]} · ${suggestion.name}`) }
  }
  const loadDomain = async (suggestion: BrandSuggestion, reason: BrandIcon['reason']) => {
    if (isCancelled() || seenDomains.has(suggestion.domain) || reason === 'product' && productCount >= 2) return
    seenDomains.add(suggestion.domain)
    if (reason === 'product') productCount += 1
    await Promise.all([
      loadImage(suggestion, reason, 'pubrio', 'icon'),
      loadImage(suggestion, reason, 'debounce', 'icon'),
      (async () => {
        try {
          const variants = await getBrandKit(suggestion.domain)
          if (isCancelled()) return
          // At most two declared variants; never synthesize guessed image URLs.
          await Promise.all((['icon', 'wordmark'] as const).filter((shape) => variants.some((item) => item.shape === shape))
            .map((shape) => loadImage(suggestion, reason, 'anylogo', shape, variants.find((item) => item.shape === shape))))
        } catch (error) { report(error, `AnyLogo · ${suggestion.name}`) }
      })(),
    ])
  }
  const jobs: Promise<void>[] = []
  if (domain) jobs.push(loadDomain({ name: domain, domain }, 'domain'))
  for (const query of queries.slice(0, 2)) {
    jobs.push((async () => {
      try {
        if (isCancelled()) return
        const known = getKnownBrand(query)
        const suggestions = known ? [known] : await searchBrands(query)
        if (isCancelled()) return
        const unique = suggestions.filter((item, index, items) => item.domain !== domain && items.findIndex((other) => other.domain === item.domain) === index)
        await Promise.all(unique.slice(0, queries.length > 1 ? 1 : 2).map((item) => loadDomain(item, 'product')))
      } catch (error) { report(error, `AnyLogo · Поиск «${query}»`) }
    })())
  }
  await Promise.all(jobs)
}
