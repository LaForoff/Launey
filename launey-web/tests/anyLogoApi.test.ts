import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createAnyLogoService, normalizeBrandDomain, validateBrandImage } from '../vite.plugins/anyLogoApi.ts'

const json = (value: unknown, init?: ResponseInit) => new Response(JSON.stringify(value), init)
const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#000" d="M0 0h24v24H0z"/></svg>'

test('freshly downloaded image is served synchronously before Vite public-file indexing', async () => {
  const f = fixture(async () => new Response(validSvg))
  try {
    const result = await f.service.request('/api/brand-image?provider=pubrio&domain=example.com&variant=icon')
    assert.ok(result?.payload.ok && 'localIcon' in result.payload)
    const path = result.payload.localIcon
    function serve(url: string, method = 'GET', headers = {}) {
      const response = { statusCode: 0, headers: {} as Record<string, string | number>, body: undefined as Buffer | undefined,
        setHeader(name: string, value: string | number) { this.headers[name] = value }, end(value?: Buffer) { this.body = value } }
      const handled = f.service.handleAsset({ url, method, headers } as IncomingMessage, response as unknown as ServerResponse)
      return { handled, response }
    }
    const first = serve(path)
    assert.equal(first.handled, true)
    assert.equal(first.response.statusCode, 200)
    assert.equal(first.response.headers['Content-Type'], 'image/svg+xml')
    assert.equal(first.response.body?.toString(), validSvg)
    assert.equal(serve(path, 'HEAD').response.body, undefined)
    assert.equal(serve(path, 'GET', { 'if-none-match': first.response.headers.ETag }).response.statusCode, 304)
    assert.equal(serve(`/icon-cache/pubrio-${'a'.repeat(64)}.svg`).response.statusCode, 404)
    assert.equal(serve('/icon-cache/../../data/settings.json').handled, false)
    assert.equal(serve('/api/brand-image').handled, false)
  } finally { f.cleanup() }
})
function fixture(fetchImpl: typeof fetch, now?: () => number) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'launey-anylogo-test-'))
  return { rootDir, service: createAnyLogoService({ rootDir, fetch: fetchImpl, now }), cleanup: () => rmSync(rootDir, { recursive: true, force: true }) }
}

test('public domains reject URLs, ports, local names and IP encodings', () => {
  for (const domain of ['localhost', 'localhost.local', '127.0.0.1', '[::1]', '2130706433', 'example.com:443', 'https://example.com', 'foo.internal', 'foo..com', '-foo.com', 'foo.com/../x', 'foo.com?x=1', 'foo%2Ecom']) assert.equal(normalizeBrandDomain(domain), null, domain)
  assert.equal(normalizeBrandDomain('Linear.APP'), 'linear.app')
  assert.equal(normalizeBrandDomain('пример.рф'), 'xn--e1afmkfd.xn--p1ai')
})

test('search single-flight, normalization, metadata disk reuse, empty TTL and failure TTL', async () => {
  let calls = 0, time = 1_000_000
  const f = fixture(async () => { calls++; await Promise.resolve(); return json({ suggestions: [{ name: 'Linear', domain: 'linear.app', logo: 'https://evil.invalid/foo' }, { name: 'Bad', domain: 'localhost' }, { name: 'Duplicate', domain: 'linear.app' }] }) }, () => time)
  try {
    const responses = await Promise.all(Array.from({ length: 8 }, () => f.service.request('/api/brand-search?query=Linear')))
    assert.equal(calls, 1)
    assert.deepEqual(responses[0], { status: 200, payload: { ok: true, suggestions: [{ name: 'Linear', domain: 'linear.app' }] } })
    assert.deepEqual(await f.service.request('/api/brand-search?query=linear'), responses[0])
    const restarted = createAnyLogoService({ rootDir: f.rootDir, fetch: async () => { throw new Error('Unexpected network') }, now: () => time })
    assert.deepEqual(await restarted.request('/api/brand-search?query=Linear'), responses[0])
    time += 24 * 60 * 60_000 + 1
    await f.service.request('/api/brand-search?query=Linear')
    assert.equal(calls, 2)
  } finally { f.cleanup() }

  let emptyCalls = 0
  const empty = fixture(async () => { emptyCalls++; return json({ suggestions: [] }) }, () => time)
  try {
    await empty.service.request('/api/brand-search?query=Nope')
    time += 14 * 60_000
    await empty.service.request('/api/brand-search?query=Nope')
    assert.equal(emptyCalls, 1)
    time += 60_001
    await empty.service.request('/api/brand-search?query=Nope')
    assert.equal(emptyCalls, 2)
  } finally { empty.cleanup() }

  let failures = 0
  const failed = fixture(async () => { failures++; throw new Error('offline') }, () => time)
  try {
    assert.equal((await failed.service.request('/api/brand-search?query=Error'))?.status, 502)
    await failed.service.request('/api/brand-search?query=Error')
    assert.equal(failures, 1)
    time += 30_001
    await failed.service.request('/api/brand-search?query=Error')
    assert.equal(failures, 2)
  } finally { failed.cleanup() }
})

test('documented kit returns only known shapes and ignores upstream asset URLs', async () => {
  let called = ''
  const f = fixture(async (url) => { called = String(url); return json({ domain: 'linear.app', variants: [{ shape: 'icon', scalable: true, contentType: 'image/svg+xml', url: 'https://evil.invalid/a' }, { shape: 'wordmark', width: 120, height: 30 }, { shape: 'unknown' }] }) })
  try {
    const response = await f.service.request('/api/brand-kit?domain=linear.app')
    assert.equal(called, 'https://api.anylogo.dev/kit/linear.app')
    assert.deepEqual(response, { status: 200, payload: { ok: true, variants: [{ shape: 'icon', scalable: true }, { shape: 'wordmark', width: 120, height: 30 }] } })
  } finally { f.cleanup() }
})

test('image uses a fixed host, content SHA256 and durable source index across restart', async () => {
  let calls = 0
  const f = fixture(async (url, init) => { calls++; assert.equal(String(url), 'https://img.anylogo.dev/linear.app?variant=icon'); assert.equal(init?.redirect, 'manual'); return new Response(validSvg) })
  try {
    const first = await f.service.request('/api/brand-image?domain=linear.app&variant=icon')
    assert.equal(first?.status, 200)
    assert.ok(first?.payload.ok && 'localIcon' in first.payload)
    if (!first?.payload.ok || !('localIcon' in first.payload)) return
    assert.match(first.payload.localIcon, /^\/icon-cache\/anylogo-[a-f0-9]{64}\.svg$/)
    assert.equal(readFileSync(resolve(f.rootDir, 'public' + first.payload.localIcon), 'utf8'), validSvg)
    const restarted = createAnyLogoService({ rootDir: f.rootDir, fetch: async () => { calls++; throw new Error('Unexpected download') } })
    assert.deepEqual(await restarted.request('/api/brand-image?domain=linear.app&variant=icon'), first)
    assert.equal(calls, 1)
  } finally { f.cleanup() }
})

test('local metadata and image rolling limits do not automatically retry', async () => {
  let calls = 0, time = 1_000_000
  const f = fixture(async () => { calls++; return json({ suggestions: [] }) }, () => time)
  try {
    for (let i = 0; i < 15; i++) assert.equal((await f.service.request(`/api/brand-search?query=Query${i}`))?.status, 200)
    const limited = await f.service.request('/api/brand-search?query=Extra')
    assert.equal(limited?.status, 429)
    assert.equal(calls, 15)
    time += 60_001
    assert.equal((await f.service.request('/api/brand-search?query=Extra'))?.status, 200)
    assert.equal(calls, 16)
  } finally { f.cleanup() }
  const images = fixture(async () => new Response(validSvg), () => time)
  try {
    for (let i = 0; i < 40; i++) assert.equal((await images.service.request(`/api/brand-image?domain=brand${i}.com&variant=icon`))?.status, 200)
    assert.equal((await images.service.request('/api/brand-image?domain=extra.com&variant=icon'))?.status, 429)
  } finally { images.cleanup() }
})

test('upstream AnyLogo Retry-After cooldown is provider-wide, persisted and still permits cache hits', async () => {
  let calls = 0, time = 1_000_000
  const f = fixture(async () => { calls++; return calls === 1 ? json({ suggestions: [] }) : new Response('', { status: 429, headers: { 'retry-after': '90' } }) }, () => time)
  try {
    const cached = await f.service.request('/api/brand-search?query=Cached')
    assert.equal((await f.service.request('/api/brand-search?query=Limited'))?.status, 429)
    assert.equal((await f.service.request('/api/brand-kit?domain=other.com'))?.status, 429)
    assert.equal(calls, 2)
    assert.deepEqual(await f.service.request('/api/brand-search?query=Cached'), cached)
    const restarted = createAnyLogoService({ rootDir: f.rootDir, fetch: async () => { throw new Error('Unexpected network') }, now: () => time })
    const cooldown = await restarted.request('/api/brand-image?domain=other.com&variant=icon')
    assert.equal(cooldown?.status, 429)
    assert.deepEqual(cooldown?.payload, { ok: false, error: 'AnyLogo is cooling down', retryAfterSeconds: 90 })
    time += 90_001
  } finally { f.cleanup() }
})

test('requests are limited to three concurrent upstream calls', async () => {
  let active = 0, peak = 0
  const release: Array<() => void> = []
  const f = fixture(async () => {
    active++; peak = Math.max(peak, active)
    await new Promise<void>((done) => release.push(done))
    active--
    return json({ suggestions: [] })
  })
  try {
    const pending = Array.from({ length: 6 }, (_, i) => f.service.request(`/api/brand-search?query=Query${i}`))
    for (let i = 0; i < 6; i++) {
      await new Promise((done) => setImmediate(done))
      assert.ok(release.length)
      release.shift()!()
    }
    await Promise.all(pending)
    assert.equal(peak, 3)
  } finally { f.cleanup() }
})

test('bounded disk metadata cache keeps at most 200 entries', async () => {
  let time = 1_000_000
  const f = fixture(async () => json({ suggestions: [{ name: 'Linear', domain: 'linear.app' }] }), () => time)
  try {
    for (let i = 0; i < 205; i++) { await f.service.request(`/api/brand-search?query=Query${i}`); time += 60001 }
    const disk = JSON.parse(readFileSync(resolve(f.rootDir, 'data/anylogo-cache.json'), 'utf8'))
    assert.equal(disk.entries.length, 200)
  } finally { f.cleanup() }
})

test('redirects, malformed metadata, large headers and oversized streamed bodies fail closed', async () => {
  const responses = [
    () => new Response('', { status: 302, headers: { location: 'https://evil.invalid/logo' } }),
    () => new Response('{broken'),
    () => new Response('{}', { headers: { 'content-length': String(512 * 1024 + 1) } }),
    () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(512 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close() } })),
  ]
  for (const response of responses) {
    let calls = 0
    const f = fixture(async () => { calls++; return response() })
    try { assert.equal((await f.service.request('/api/brand-search?query=Linear'))?.status, 502); assert.equal(calls, 1) }
    finally { f.cleanup() }
  }
})

test('invalid inputs never use network; unknown routes pass through', async () => {
  const f = fixture(async () => { throw new Error('Unexpected network') })
  try {
    for (const url of ['/api/brand-search?query=a', '/api/brand-search?query=' + 'a'.repeat(81), '/api/brand-kit?domain=127.0.0.1', '/api/brand-image?domain=linear.app&variant=anything']) assert.equal((await f.service.request(url))?.status, 400)
    assert.equal((await f.service.request('/api/brand-search?query=Linear', 'POST'))?.status, 405)
    assert.equal(await f.service.request('/api/unrelated'), null)
  } finally { f.cleanup() }
})

test('SVG structural validation rejects active/external content and malformed XML', () => {
  assert.equal(validateBrandImage(Buffer.from(validSvg)), 'svg')
  assert.equal(validateBrandImage(Buffer.from('<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#g)" d="M0 0"/></svg>')), 'svg')
  assert.equal(validateBrandImage(Buffer.from('<svg><style type="text/css">.st0 { fill: #fff; opacity: 0.8; } .st1,path{fill:url( #g );}</style><path class="st0" style="fill:url(#g);stroke:#000" d="M0 0"/></svg>')), 'svg')
  const rejected = [
    '<svg><style>@import url(https://evil.invalid/x);</style></svg>', '<svg><path style="fill:url(https://evil.invalid/x)"/></svg>', '<svg><style>.x{fill:red;background:url(x)}</style></svg>', '<svg><style>.x{fill:red} @import url(x);</style></svg>',
    '<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"/>', '<svg><foreignObject/></svg>',
    '<svg><image href="https://evil.invalid/a"/></svg>', '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
    '<svg><use href="https://evil.invalid/a"/></svg>', '<svg><path fill="url(https://evil.invalid/a)"/></svg>',
    '<svg><path></svg>', '<svg/><svg/>', '<svg>&#60;script</svg>',
    '<svg xmlns="https://evil.invalid/ns"/>', '<svg width="9999"/>', '<svg><path fill="red" fill="blue"/></svg>',
  ]
  for (const source of rejected) assert.throws(() => validateBrandImage(Buffer.from(source)), source)
  const png = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(4097, 16); png.writeUInt32BE(1, 20)
  assert.throws(() => validateBrandImage(png), /dimensions/)
  assert.throws(() => validateBrandImage(Buffer.from('<html>error</html>')))
})


test('real-world SVG mask fixture allows only safe luminance and alpha mask types', () => {
  const maskedLogo = readFileSync(new URL('./fixtures/anylogo-masked-logo.svg', import.meta.url))
  assert.equal(validateBrandImage(maskedLogo), 'svg')
  for (const value of ['luminance', 'alpha']) {
    assert.equal(validateBrandImage(Buffer.from(`<svg><mask id="m" mask-type="${value}" x="-162" y="-79" width="235" height="152"><path d="M0 0"/></mask></svg>`)), 'svg')
    assert.equal(validateBrandImage(Buffer.from(`<svg><mask style="mask-type: ${value};"/></svg>`)), 'svg')
    assert.equal(validateBrandImage(Buffer.from(`<svg><style>.m {mask-type: ${value};}</style><mask class="m"/></svg>`)), 'svg')
  }
  for (const value of ['url(#m)', 'url(https://evil.invalid/logo)', 'inherit', 'image(logo)', 'luminance alpha']) {
    assert.throws(() => validateBrandImage(Buffer.from(`<svg><mask style="mask-type:${value}"/></svg>`)))
    assert.throws(() => validateBrandImage(Buffer.from(`<svg><mask mask-type="${value}"/></svg>`)))
  }
})

test('each provider single-flights and persists its own distinct path for identical bytes', async () => {
  const urls: string[] = []
  const f = fixture(async (url, init) => { urls.push(String(url)); assert.equal(init?.redirect, 'manual'); await Promise.resolve(); return new Response(validSvg) })
  const providers = ['anylogo', 'pubrio', 'debounce'] as const
  try {
    const paths: string[] = []
    for (const provider of providers) {
      const route = `/api/brand-image?provider=${provider}&domain=linear.app&variant=icon`
      const responses = await Promise.all(Array.from({ length: 6 }, () => f.service.request(route)))
      assert.equal(responses[0]?.status, 200)
      const payload = responses[0]!.payload
      assert.ok(payload.ok && 'localIcon' in payload)
      if (!payload.ok || !('localIcon' in payload)) continue
      assert.match(payload.localIcon, new RegExp(`^/icon-cache/${provider}-[a-f0-9]{64}\\.svg$`))
      paths.push(payload.localIcon)
      const restarted = createAnyLogoService({ rootDir: f.rootDir, fetch: async () => { throw new Error('Unexpected network') } })
      assert.deepEqual(await restarted.request(route), responses[0])
    }
    assert.equal(new Set(paths).size, 3)
    assert.equal(new Set(paths.map((path) => path.replace(/(?:anylogo|pubrio|debounce)-/, ''))).size, 1)
    assert.deepEqual(urls, ['https://img.anylogo.dev/linear.app?variant=icon', 'https://logo.pubrio.com/linear.app', 'https://logo.debounce.com/linear.app'])
  } finally { f.cleanup() }
})

test('provider cooldown persists independently and never blocks another provider', async () => {
  let calls = 0
  const f = fixture(async (url) => { calls++; return String(url).includes('pubrio.com') ? new Response('', { status: 429, headers: { 'retry-after': '120' } }) : new Response(validSvg) }, () => 1_000_000)
  try {
    assert.equal((await f.service.request('/api/brand-image?provider=pubrio&domain=linear.app&variant=icon'))?.status, 429)
    assert.equal((await f.service.request('/api/brand-image?provider=pubrio&domain=gitlab.com&variant=icon'))?.status, 429)
    assert.equal(calls, 1)
    assert.equal((await f.service.request('/api/brand-image?provider=debounce&domain=linear.app&variant=icon'))?.status, 200)
    assert.equal((await f.service.request('/api/brand-image?domain=linear.app&variant=icon'))?.status, 200)
    const restarted = createAnyLogoService({ rootDir: f.rootDir, fetch: async () => { calls++; return new Response(validSvg) }, now: () => 1_000_000 })
    const limited = await restarted.request('/api/brand-image?provider=pubrio&domain=other.com&variant=icon')
    assert.equal(limited?.status, 429)
    assert.equal(calls, 3)
    assert.equal((await restarted.request('/api/brand-image?provider=debounce&domain=other.com&variant=icon'))?.status, 200)
    assert.equal(calls, 4)
  } finally { f.cleanup() }
})

test('global image budget caps all providers at sixty while metadata remains available', async () => {
  let calls = 0
  const f = fixture(async (url) => { calls++; return String(url).includes('api.anylogo.dev') ? json({ suggestions: [] }) : new Response(validSvg) }, () => 1_000_000)
  try {
    for (const provider of ['anylogo', 'pubrio', 'debounce']) {
      for (let i = 0; i < 20; i++) assert.equal((await f.service.request(`/api/brand-image?provider=${provider}&domain=brand${i}.com&variant=icon`))?.status, 200)
    }
    for (const provider of ['anylogo', 'pubrio', 'debounce']) assert.equal((await f.service.request(`/api/brand-image?provider=${provider}&domain=extra.com&variant=icon`))?.status, 429)
    assert.equal(calls, 60)
    assert.equal((await f.service.request('/api/brand-search?query=Linear'))?.status, 200)
    assert.equal(calls, 61)
  } finally { f.cleanup() }
})

test('Pubrio and DeBounce each enforce thirty image requests per minute', async () => {
  for (const provider of ['pubrio', 'debounce']) {
    let calls = 0
    const f = fixture(async () => { calls++; return new Response(validSvg) }, () => 1_000_000)
    try {
      for (let i = 0; i < 30; i++) assert.equal((await f.service.request(`/api/brand-image?provider=${provider}&domain=brand${i}.com&variant=icon`))?.status, 200)
      assert.equal((await f.service.request(`/api/brand-image?provider=${provider}&domain=extra.com&variant=icon`))?.status, 429)
      assert.equal(calls, 30)
    } finally { f.cleanup() }
  }
})

test('invalid providers and unavailable wordmark variants never use network', async () => {
  let calls = 0
  const f = fixture(async () => { calls++; return new Response(validSvg) })
  try {
    for (const provider of ['unknown', '', 'PUBRIO', 'https://evil.invalid', '__proto__']) assert.equal((await f.service.request(`/api/brand-image?provider=${encodeURIComponent(provider)}&domain=linear.app&variant=icon`))?.status, 400)
    for (const provider of ['pubrio', 'debounce']) assert.equal((await f.service.request(`/api/brand-image?provider=${provider}&domain=linear.app&variant=wordmark`))?.status, 400)
    assert.equal(calls, 0)
  } finally { f.cleanup() }
})

test('explicit placeholder headers are cached as missing for one hour', async () => {
  for (const header of ['x-anylogo-fallback', 'x-logo-fallback', 'x-placeholder']) {
    let calls = 0, time = 1_000_000
    const f = fixture(async () => { calls++; return new Response(validSvg, { headers: { [header]: 'true' } }) }, () => time)
    try {
      const route = '/api/brand-image?provider=pubrio&domain=linear.app&variant=icon'
      assert.equal((await f.service.request(route))?.status, 404)
      time += 59 * 60_000
      assert.equal((await f.service.request(route))?.status, 404)
      assert.equal(calls, 1)
      time += 60_001
      assert.equal((await f.service.request(route))?.status, 404)
      assert.equal(calls, 2)
    } finally { f.cleanup() }
  }
  const f = fixture(async () => new Response(validSvg, { headers: { 'x-placeholder': 'false', 'x-logo-fallback': '0' } }))
  try { assert.equal((await f.service.request('/api/brand-image?provider=debounce&domain=linear.app&variant=icon'))?.status, 200) }
  finally { f.cleanup() }
})

test('legacy AnyLogo image cache and legacy cooldown migrate without affecting other providers', async () => {
  let calls = 0
  const f = fixture(async () => { calls++; return new Response(validSvg) }, () => 1_000_000)
  try {
    const route = '/api/brand-image?domain=linear.app&variant=icon'
    const existing = await f.service.request(route)
    const cachePath = resolve(f.rootDir, 'data/anylogo-cache.json')
    const disk = JSON.parse(readFileSync(cachePath, 'utf8'))
    disk.entries = disk.entries.map(([key, value]: [string, unknown]) => [key.replace('image:anylogo:', 'image:'), value])
    disk.cooldownUntil = 1_090_000
    delete disk.cooldowns
    mkdirSync(resolve(f.rootDir, 'data'), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(disk))
    const restarted = createAnyLogoService({ rootDir: f.rootDir, fetch: async () => { calls++; return new Response(validSvg) }, now: () => 1_000_000 })
    assert.deepEqual(await restarted.request(route), existing)
    assert.equal(calls, 1)
    assert.equal((await restarted.request('/api/brand-image?domain=gitlab.com&variant=icon'))?.status, 429)
    assert.equal((await restarted.request('/api/brand-image?provider=pubrio&domain=linear.app&variant=icon'))?.status, 200)
    assert.equal(calls, 2)
  } finally { f.cleanup() }
})

test('three-request concurrency cap is shared across metadata and all image providers', async () => {
  let active = 0, peak = 0
  const release: Array<() => void> = []
  const f = fixture(async (url) => {
    active++; peak = Math.max(peak, active)
    await new Promise<void>((done) => release.push(done))
    active--
    return String(url).includes('api.anylogo.dev') ? json({ suggestions: [] }) : new Response(validSvg)
  })
  try {
    const pending = [
      '/api/brand-search?query=Linear',
      ...['anylogo', 'pubrio', 'debounce'].map((provider) => `/api/brand-image?provider=${provider}&domain=linear.app&variant=icon`),
      ...['pubrio', 'debounce'].map((provider) => `/api/brand-image?provider=${provider}&domain=gitlab.com&variant=icon`),
    ].map((route) => f.service.request(route))
    await new Promise((done) => setImmediate(done))
    assert.equal(active, 3)
    for (let i = 0; i < pending.length; i++) {
      assert.ok(release.length)
      release.shift()!()
      await new Promise((done) => setImmediate(done))
    }
    const results = await Promise.all(pending)
    assert.ok(results.every((result) => result?.status === 200))
    assert.equal(peak, 3)
  } finally { f.cleanup() }
})


test('observed Pubrio placeholder hash is missing only for Pubrio and persists its negative cache', async () => {
  const placeholder = readFileSync(new URL('./fixtures/pubrio-placeholder.svg', import.meta.url))
  assert.equal(createHash('sha256').update(placeholder).digest('hex'), '60dd26ecb0a70ae7cd7737c82d53cb6b6f8bef8b97e1ce0ad3b34b22e5b20966')
  let calls = 0, time = 1_000_000
  const f = fixture(async () => { calls++; return new Response(placeholder, { headers: { 'cache-control': 'no-store' } }) }, () => time)
  try {
    const route = '/api/brand-image?provider=pubrio&domain=linear.app&variant=icon'
    assert.equal((await f.service.request(route))?.status, 404)
    const restarted = createAnyLogoService({ rootDir: f.rootDir, fetch: async () => { throw new Error('Unexpected network') }, now: () => time })
    assert.equal((await restarted.request(route))?.status, 404)
    time += 59 * 60_000
    assert.equal((await f.service.request(route))?.status, 404)
    assert.equal(calls, 1)
    // This exact fingerprint is evidence about Pubrio, not a cross-provider dedup rule.
    assert.equal((await f.service.request('/api/brand-image?provider=anylogo&domain=linear.app&variant=icon'))?.status, 200)
    assert.equal(calls, 2)
    time += 60_001
    assert.equal((await f.service.request(route))?.status, 404)
    assert.equal(calls, 3)
  } finally { f.cleanup() }
})

test('x-logo-status missing indicators are negative, normal no-store images remain valid', async () => {
  for (const status of ['not-found', 'missing', 'fallback']) {
    const f = fixture(async () => new Response(validSvg, { headers: { 'x-logo-status': status } }))
    try { assert.equal((await f.service.request('/api/brand-image?provider=debounce&domain=linear.app&variant=icon'))?.status, 404) }
    finally { f.cleanup() }
  }
  for (const provider of ['anylogo', 'pubrio', 'debounce']) {
    const f = fixture(async () => new Response(validSvg, { headers: { 'cache-control': 'no-store', 'x-logo-status': 'found' } }))
    try { assert.equal((await f.service.request(`/api/brand-image?provider=${provider}&domain=linear.app&variant=icon`))?.status, 200) }
    finally { f.cleanup() }
  }
})


test('explicit fallback headers recognize only documented positive indicators', async () => {
  for (const header of ['x-anylogo-fallback', 'x-logo-fallback', 'x-placeholder', 'x-logo-placeholder', 'x-fallback']) {
    for (const indicator of ['1', 'true', 'yes', 'monogram', 'transparent', 'placeholder', 'not-found', 'missing', 'fallback']) {
      const f = fixture(async () => new Response(validSvg, { headers: { [header]: indicator } }))
      try { assert.equal((await f.service.request('/api/brand-image?provider=pubrio&domain=linear.app&variant=icon'))?.status, 404, `${header}: ${indicator}`) }
      finally { f.cleanup() }
    }
    for (const indicator of ['0', 'false', 'no', 'none', '', 'unknown', 'custom-logo', 'original']) {
      const f = fixture(async () => new Response(validSvg, { headers: { [header]: indicator } }))
      try { assert.equal((await f.service.request('/api/brand-image?provider=pubrio&domain=linear.app&variant=icon'))?.status, 200, `${header}: ${indicator}`) }
      finally { f.cleanup() }
    }
  }
})
