import assert from 'node:assert/strict'
import test from 'node:test'
import { getBrandContext, getBrandSearchTarget, getKnownBrand, searchBrands, getBrandKit, getBrandImage } from '../src/lib/brandIcons.ts'
import { searchLocalBrandIcons } from '../src/lib/localBrandIcons.ts'

test('domain boundaries, meaningful product hints and duplicate query suppression', () => {
  const context = getBrandContext('https://datalens.prod.mos.ru/dashboard?token=secret', 'DataLens')
  assert.equal(context.domain, 'mos.ru')
  assert.equal(context.productHint, 'datalens')
  assert.deepEqual(context.queries, ['DataLens'])
  assert.equal(getBrandContext('https://analytics.company.co.uk', '').domain, 'company.co.uk')
  assert.equal(getBrandContext('https://tenant.github.io', '').domain, 'tenant.github.io')
  assert.deepEqual(getBrandContext('https://login.prod.company.com', 'Company').queries, [])
})

test('private/IP/invalid URLs never become catalog domains', () => {
  for (const url of ['http://127.0.0.1', 'http://[::1]', 'http://thing.local', 'file:///tmp/file', 'not a url']) {
    assert.equal(getBrandContext(url, '').domain, '', url)
  }
  assert.equal(getBrandContext('https://пример.рф', '').domain, 'xn--e1afmkfd.xn--p1ai')
})

test('verified products and explicitly supplied domains bypass sparse search index', () => {
  assert.deepEqual(getKnownBrand('DataLens'), { name: 'DataLens', domain: 'datalens.tech' })
  assert.equal(getKnownBrand('https://www.linear.app/')?.domain, 'linear.app')
  assert.equal(getKnownBrand('Unknown product'), undefined)
  assert.equal(getKnownBrand('127.0.0.1'), undefined)
})

test('GitLab on a corporate domain and typed URLs preserve the product hint', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Local catalog must not use internet') }
  try {
    const auto = getBrandSearchTarget('https://gitlab.lanit-tercom.ru', 'Корпоративный репозиторий', '', false)
    assert.equal(auto.domain, 'lanit-tercom.ru')
    assert.ok(auto.searchQueries.includes('gitlab'))
    const typed = getBrandSearchTarget('https://mos.ru', 'Москва', 'gitlab.lanit-tercom.ru', true)
    assert.equal(typed.domain, 'lanit-tercom.ru')
    assert.deepEqual(typed.searchQueries, ['gitlab'])
    const icons = await searchLocalBrandIcons(typed.searchQueries)
    assert.equal(icons[0].name, 'GitLab')
    assert.equal(icons[0].provider, 'svg-logos')
    assert.ok(icons[0].localIcon.startsWith('data:image/svg+xml;base64,'))
    assert.equal((await searchLocalBrandIcons(['grafana']))[0].name, 'Grafana')
    assert.equal((await searchLocalBrandIcons(['prometheus']))[0].name, 'Prometheus')
  } finally { globalThis.fetch = original }
})

test('JetBrains preserves original gradients and a colored square takes priority over the black icon', async () => {
  const icons = await searchLocalBrandIcons(['JetBrains'])
  assert.equal(icons[0].name, 'JetBrains')
  assert.equal(icons[0].id, 'svg-logos:jetbrains')
  assert.equal(icons[0].shape, 'icon')
  assert.equal(icons[0].artwork, 'original')
  const svg = Buffer.from(icons[0].localIcon.split(',')[1], 'base64').toString('utf8')
  assert.ok(svg.includes('<linearGradient'))
  assert.ok(svg.includes('stop-color'))
  assert.ok(svg.includes('#fe2857'))
  assert.ok(svg.includes('#293896'))
  assert.ok(!icons.some((icon) => icon.id === 'svg-logos:jetbrains-icon'))
  const gitlab = (await searchLocalBrandIcons(['gitlab']))[0]
  const gitlabSVG = Buffer.from(gitlab.localIcon.split(',')[1], 'base64').toString('utf8')
  assert.equal(gitlab.id, 'svg-logos:gitlab-icon')
  assert.ok(gitlabSVG.includes('#e24329'))
  assert.ok(gitlabSVG.includes('#fca326'))
  assert.equal((await searchLocalBrandIcons(['WebStorm']))[0].artwork, 'original')
})

test('shared normalized requests, empty-result cache and local assets do not repeat fetches', async () => {
  const original = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (url.includes('brand-search')) return Response.json({ ok: true, suggestions: [] })
    if (url.includes('brand-kit')) return Response.json({ ok: true, variants: [{ shape: 'icon' }] })
    return Response.json({ ok: true, localIcon: `/icon-cache/anylogo-${'a'.repeat(64)}.svg` })
  }
  try {
    await Promise.all([searchBrands('Unique Brand'), searchBrands(' UNIQUE   BRAND ')])
    await searchBrands('unique brand')
    assert.equal(calls.length, 1)
    await getBrandKit('linear.app')
    await getBrandKit('LINEAR.APP')
    await Promise.all([getBrandImage('linear.app', 'icon'), getBrandImage('linear.app', 'icon')])
    assert.equal(calls.length, 3)
    assert.ok(calls.every((url) => !url.includes('anylogo.dev')))
    assert.ok(calls.every((url) => !url.includes('token=secret')))
  } finally { globalThis.fetch = original }
})

test('provider cooldown prevents further requests and failures are cached', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return Response.json({ ok: false, retryAfterSeconds: 90 }, { status: 429 })
  }
  try {
    await assert.rejects(searchBrands('limited brand'))
    await assert.rejects(searchBrands('limited brand'))
    await assert.rejects(getBrandKit('another.example.com'))
    assert.equal(calls, 1)
    // Cached successes remain available during a provider cooldown.
    assert.equal((await getBrandKit('linear.app')).length, 1)
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})
