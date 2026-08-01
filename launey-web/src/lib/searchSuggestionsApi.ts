import type { SearchEngineId } from './searchEngines'

interface SearchSuggestionsPayload {
  suggestions?: unknown
}

export async function fetchSearchSuggestions(
  query: string,
  searchEngine: SearchEngineId,
  signal?: AbortSignal,
): Promise<string[]> {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return []
  }

  const searchParams = new URLSearchParams({ engine: searchEngine, q: trimmedQuery })
  const response = await fetch(`/api/search-suggestions?${searchParams}`, { signal })

  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as SearchSuggestionsPayload

  if (!Array.isArray(payload.suggestions)) {
    return []
  }

  return payload.suggestions
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, 6)
}
