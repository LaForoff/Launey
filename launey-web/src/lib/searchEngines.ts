import bingLogo from '../assets/search-engines/logo-bing.svg'
import duckDuckGoLogo from '../assets/search-engines/logo-ddgo.svg'
import googleLogo from '../assets/search-engines/logo-google.svg'
import yandexLogo from '../assets/search-engines/logo-yandex.svg'

export type SearchEngineId = 'google' | 'yandex' | 'duckduckgo' | 'bing'

export interface SearchEngine {
  id: SearchEngineId
  name: string
  logo: string
  searchUrl: string
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    logo: googleLogo,
    searchUrl: 'https://www.google.com/search?q=',
  },
  {
    id: 'yandex',
    name: 'Яндекс',
    logo: yandexLogo,
    searchUrl: 'https://yandex.ru/search/?text=',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    logo: duckDuckGoLogo,
    searchUrl: 'https://duckduckgo.com/?q=',
  },
  {
    id: 'bing',
    name: 'Bing',
    logo: bingLogo,
    searchUrl: 'https://www.bing.com/search?q=',
  },
] as const

export const DEFAULT_SEARCH_ENGINE: SearchEngineId = 'google'

export function isSearchEngineId(value: unknown): value is SearchEngineId {
  return SEARCH_ENGINES.some((engine) => engine.id === value)
}

export function getSearchEngine(id: SearchEngineId) {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? SEARCH_ENGINES[0]
}
