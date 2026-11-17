import assert from 'node:assert/strict'
import test from 'node:test'
import { collectRemoteBrandIcons } from '../src/lib/brandSearch.ts'
import type { BrandIcon } from '../src/lib/brandIcons.ts'

const hash = 'b'.repeat(64)
function imageResponse(url: URL) {
  return Response.json({ ok: true, localIcon: `/icon-cache/${url.searchParams.get('provider')}-${hash}.png` })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

test('identical content from two providers remains two separate cards; AnyLogo failure is isolated', async () => {
  const original = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://localhost')
    calls.push(url.toString())
    if (url.pathname === '/api/brand-kit') return Response.json({ ok: false }, { status: 502 })
    return imageResponse(url)
  }
  try {
    const results: BrandIcon[] = [], errors: string[] = []
    const options = { domain: 'identical.com', queries: [], isCancelled: () => false, onResult: (icon: BrandIcon) => results.push(icon), onError: (message: string) => errors.push(message) }
    await collectRemoteBrandIcons(options)
    assert.equal(results.length, 2)
    assert.deepEqual(new Set(results.map((icon) => icon.provider)), new Set(['pubrio', 'debounce']))
    assert.equal(new Set(results.map((icon) => icon.id)).size, 2)
    assert.ok(results.every((icon) => icon.localIcon.endsWith(`${hash}.png`)))
    assert.equal(errors.length, 1)
    assert.ok(errors[0].startsWith('AnyLogo ·'))
    const firstCount = calls.length
    results.length = 0
    await collectRemoteBrandIcons(options)
    assert.equal(results.length, 2)
    assert.equal(calls.length, firstCount, 'reopening should use successes and cached failures')
  } finally { globalThis.fetch = original }
})

test('fast provider is published before slow provider completes', async () => {
  const original = globalThis.fetch
  const slow = deferred<Response>(), firstResult = deferred<BrandIcon>()
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/brand-kit') return Response.json({ ok: true, variants: [] })
    if (url.searchParams.get('provider') === 'debounce') return slow.promise
    return imageResponse(url)
  }
  try {
    const results: BrandIcon[] = []
    let finished = false
    const job = collectRemoteBrandIcons({ domain: 'progressive.com', queries: [], isCancelled: () => false, onResult: (icon) => { results.push(icon); firstResult.resolve(icon) }, onError: assert.fail }).then(() => { finished = true })
    assert.equal((await firstResult.promise).provider, 'pubrio')
    assert.equal(finished, false)
    assert.equal(results.length, 1)
    slow.resolve(Response.json({ ok: true, localIcon: `/icon-cache/debounce-${hash}.png` }))
    await job
    assert.equal(results.length, 2)
  } finally { globalThis.fetch = original }
})

test('same concurrent searches share requests without merging result identities', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input) => {
    calls += 1
    const url = new URL(String(input), 'http://localhost')
    await Promise.resolve()
    if (url.pathname === '/api/brand-kit') return Response.json({ ok: true, variants: [{ shape: 'icon' }, { shape: 'wordmark' }] })
    return imageResponse(url)
  }
  try {
    const first: BrandIcon[] = [], second: BrandIcon[] = []
    const options = { domain: 'shared.com', queries: [], isCancelled: () => false, onError: assert.fail }
    await Promise.all([
      collectRemoteBrandIcons({ ...options, onResult: (icon) => first.push(icon) }),
      collectRemoteBrandIcons({ ...options, onResult: (icon) => second.push(icon) }),
    ])
    assert.equal(calls, 5, 'one kit + four provider/variant image requests')
    assert.equal(first.length, 4)
    assert.equal(second.length, 4)
    assert.equal(first.filter((icon) => icon.provider === 'anylogo').length, 2, 'even same-image icon/wordmark stay separate')
  } finally { globalThis.fetch = original }
})

test('closing a search discards a late name response and prevents follow-up requests', async () => {
  const original = globalThis.fetch
  const lookup = deferred<Response>(), started = deferred<void>()
  const paths: string[] = []
  let cancelled = false
  globalThis.fetch = async (input) => {
    paths.push(String(input)); started.resolve()
    return lookup.promise
  }
  try {
    const job = collectRemoteBrandIcons({ domain: '', queries: ['Late result'], isCancelled: () => cancelled, onResult: assert.fail, onError: assert.fail })
    await started.promise
    cancelled = true
    lookup.resolve(Response.json({ ok: true, suggestions: [{ name: 'Late', domain: 'late.com' }] }))
    await job
    assert.equal(paths.length, 1)
    assert.ok(paths[0].startsWith('/api/brand-search?'))
  } finally { globalThis.fetch = original }
})

test('missing images are quiet and cached, not presented as failed providers', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input) => {
    calls += 1
    const url = new URL(String(input), 'http://localhost')
    return url.pathname === '/api/brand-kit' ? Response.json({ ok: true, variants: [] }) : Response.json({ ok: false }, { status: 404 })
  }
  try {
    const options = { domain: 'missing.com', queries: [], isCancelled: () => false, onResult: assert.fail, onError: assert.fail }
    await collectRemoteBrandIcons(options)
    const count = calls
    await collectRemoteBrandIcons(options)
    assert.equal(calls, count)
  } finally { globalThis.fetch = original }
})

test('AnyLogo rate limit cannot suppress known GitLab requests to other providers', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/brand-kit') return Response.json({ ok: false, retryAfterSeconds: 90 }, { status: 429 })
    return imageResponse(url)
  }
  try {
    const results: BrandIcon[] = []
    await collectRemoteBrandIcons({ domain: 'lanit-tercom.ru', queries: ['GitLab'], isCancelled: () => false, onResult: (icon) => results.push(icon), onError: () => {} })
    assert.equal(results.length, 4)
    assert.equal(results.filter((icon) => icon.domain === 'gitlab.com').length, 2)
    assert.ok(results.every((icon) => icon.provider === 'pubrio' || icon.provider === 'debounce'))
  } finally { globalThis.fetch = original }
})
