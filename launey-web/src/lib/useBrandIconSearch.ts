import { useEffect, useState } from 'react'
import { isRemoteBrandIcon, type BrandIcon } from './brandIcons'
import { collectRemoteBrandIcons } from './brandSearch'
import { searchLocalBrandIcons } from './localBrandIcons'

interface BrandState { key: string; loading: boolean; results: BrandIcon[]; errors: string[] }
const INITIAL: BrandState = { key: '', loading: false, results: [], errors: [] }
const PROVIDER_ORDER = { 'svg-logos': 0, 'simple-icons': 1, pubrio: 2, debounce: 3, anylogo: 4 }

export function useBrandIconSearch(enabled: boolean, domain: string, queries: string[]) {
  const queryKey = JSON.stringify(queries)
  const key = JSON.stringify([domain, queryKey])
  const [state, setState] = useState<BrandState>(INITIAL)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let remoteFinished = false
    const searchQueries = JSON.parse(queryKey) as string[]
    // Local results are independent from the network debounce and provider errors.
    const localJob = searchLocalBrandIcons([...searchQueries, domain.split('.')[0] ?? '']).then((results) => {
      if (!cancelled) setState((current) => ({
        key, loading: !remoteFinished, errors: current.key === key ? current.errors : [],
        results: [...results, ...(current.key === key ? current.results.filter(isRemoteBrandIcon) : [])],
      }))
    }).catch(() => { /* Internet sources and file import remain available. */ })
    const timer = setTimeout(() => {
      setState((current) => ({ key, loading: true, results: current.key === key ? current.results.filter((icon) => !isRemoteBrandIcon(icon)) : [], errors: [] }))
      void collectRemoteBrandIcons({
        domain, queries: searchQueries, isCancelled: () => cancelled,
        onResult: (icon) => setState((current) => ({
          ...current,
          // Separate cards for each source and variant, including identical bytes.
          results: [...current.results, icon].sort((a, b) =>
            Number(isRemoteBrandIcon(a)) - Number(isRemoteBrandIcon(b)) ||
            Number(b.reason === 'product') - Number(a.reason === 'product') ||
            PROVIDER_ORDER[a.provider ?? 'anylogo'] - PROVIDER_ORDER[b.provider ?? 'anylogo'] ||
            a.name.localeCompare(b.name) || Number(a.shape === 'wordmark') - Number(b.shape === 'wordmark')),
        })),
        onError: (message) => setState((current) => ({ ...current, errors: [...new Set([...current.errors, message])] })),
      }).finally(() => {
        remoteFinished = true
        void localJob.finally(() => {
          if (!cancelled) setState((current) => ({ ...current, loading: false }))
        })
      })
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [enabled, domain, queryKey, key])

  return state.key === key ? state : { ...INITIAL, key, loading: enabled }
}
