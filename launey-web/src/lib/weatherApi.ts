export interface WeatherSnapshot {
  temperatureC: number
  weatherCode: number
}

interface GeocodingResponse {
  results?: Array<{
    id: number
    name: string
    country?: string
    admin1?: string
    latitude: number
    longitude: number
  }>
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number
    weather_code?: number
  }
}

export interface WeatherCitySuggestion {
  id: number
  name: string
  label: string
}

export async function searchWeatherCities(query: string, signal?: AbortSignal): Promise<WeatherCitySuggestion[]> {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < 2) {
    return []
  }

  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
  geocodingUrl.searchParams.set('name', trimmedQuery)
  geocodingUrl.searchParams.set('count', '7')
  geocodingUrl.searchParams.set('language', 'ru')
  geocodingUrl.searchParams.set('format', 'json')

  const response = await fetch(geocodingUrl, { signal })

  if (!response.ok) {
    throw new Error('geocoding-search-failed')
  }

  const payload = (await response.json()) as GeocodingResponse

  return (payload.results ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    label: [entry.name, entry.admin1, entry.country].filter(Boolean).join(', '),
  }))
}

export async function loadWeatherByCity(city: string, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const trimmedCity = city.trim()
  const fallbackCity = (trimmedCity.split(',')[0] ?? '').trim()

  if (!trimmedCity) {
    throw new Error('city-required')
  }

  const firstMatch = await resolveCityCoordinates(trimmedCity, fallbackCity, signal)

  if (!firstMatch) {
    throw new Error('city-not-found')
  }

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
  weatherUrl.searchParams.set('latitude', String(firstMatch.latitude))
  weatherUrl.searchParams.set('longitude', String(firstMatch.longitude))
  weatherUrl.searchParams.set('current', 'temperature_2m,weather_code')
  weatherUrl.searchParams.set('timezone', 'auto')

  const weatherResponse = await fetch(weatherUrl, { signal })
  if (!weatherResponse.ok) {
    throw new Error('weather-failed')
  }

  const weatherPayload = (await weatherResponse.json()) as ForecastResponse
  const temperature = weatherPayload.current?.temperature_2m
  const weatherCode = weatherPayload.current?.weather_code

  if (
    typeof temperature !== 'number' ||
    Number.isNaN(temperature) ||
    typeof weatherCode !== 'number' ||
    Number.isNaN(weatherCode)
  ) {
    throw new Error('weather-invalid')
  }

  return {
    temperatureC: Math.round(temperature),
    weatherCode,
  }
}

async function resolveCityCoordinates(query: string, fallbackQuery: string, signal?: AbortSignal) {
  const primaryMatch = await fetchFirstGeocodingMatch(query, signal)
  if (primaryMatch) {
    return primaryMatch
  }

  if (!fallbackQuery || fallbackQuery.toLowerCase() === query.toLowerCase()) {
    return null
  }

  return fetchFirstGeocodingMatch(fallbackQuery, signal)
}

async function fetchFirstGeocodingMatch(query: string, signal?: AbortSignal) {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
  geocodingUrl.searchParams.set('name', query)
  geocodingUrl.searchParams.set('count', '1')
  geocodingUrl.searchParams.set('language', 'ru')
  geocodingUrl.searchParams.set('format', 'json')

  const geocodingResponse = await fetch(geocodingUrl, { signal })
  if (!geocodingResponse.ok) {
    throw new Error('geocoding-failed')
  }

  const geocodingPayload = (await geocodingResponse.json()) as GeocodingResponse
  return geocodingPayload.results?.[0] ?? null
}
