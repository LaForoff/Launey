import { useEffect, useMemo, useState } from 'react'
import { loadWeatherByCity } from '../lib/weatherApi'

const WEATHER_REFRESH_MS = 10 * 60 * 1000

interface WeatherState {
  temperatureC: number | null
  weatherCode: number | null
  isLoading: boolean
}

export function useWeather(city: string) {
  const [state, setState] = useState<WeatherState>({ temperatureC: null, weatherCode: null, isLoading: true })

  useEffect(() => {
    let isActive = true
    let refreshTimer: number | null = null
    let currentController: AbortController | null = null

    async function fetchWeather() {
      currentController?.abort()
      currentController = new AbortController()

      setState((current) => ({ ...current, isLoading: true }))

      try {
        const result = await loadWeatherByCity(city, currentController.signal)
        if (!isActive) {
          return
        }
        setState({ temperatureC: result.temperatureC, weatherCode: result.weatherCode, isLoading: false })
      } catch {
        if (!isActive) {
          return
        }
        setState((current) => ({ temperatureC: current.temperatureC, weatherCode: current.weatherCode, isLoading: false }))
      }
    }

    void fetchWeather()
    refreshTimer = window.setInterval(() => void fetchWeather(), WEATHER_REFRESH_MS)

    return () => {
      isActive = false
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer)
      }
      currentController?.abort()
    }
  }, [city])

  return useMemo(
    () => ({
      temperatureText:
        state.temperatureC === null && state.isLoading
          ? '...'
          : state.temperatureC === null
            ? '--'
            : `${state.temperatureC}°`,
      weatherIconKind: resolveWeatherIconKind(state.weatherCode),
    }),
    [state.isLoading, state.temperatureC, state.weatherCode],
  )
}

type WeatherIconKind = 'sun' | 'cloud' | 'cloud-sun' | 'rain' | 'snow' | 'lightning' | 'fog'

function resolveWeatherIconKind(weatherCode: number | null): WeatherIconKind {
  if (weatherCode === null) {
    return 'cloud'
  }

  if (weatherCode === 0) {
    return 'sun'
  }

  if (weatherCode === 1 || weatherCode === 2) {
    return 'cloud-sun'
  }

  if (weatherCode === 3) {
    return 'cloud'
  }

  if (weatherCode === 45 || weatherCode === 48) {
    return 'fog'
  }

  if (
    weatherCode === 51 ||
    weatherCode === 53 ||
    weatherCode === 55 ||
    weatherCode === 61 ||
    weatherCode === 63 ||
    weatherCode === 65 ||
    weatherCode === 80 ||
    weatherCode === 81 ||
    weatherCode === 82
  ) {
    return 'rain'
  }

  if (
    weatherCode === 56 ||
    weatherCode === 57 ||
    weatherCode === 66 ||
    weatherCode === 67 ||
    weatherCode === 71 ||
    weatherCode === 73 ||
    weatherCode === 75 ||
    weatherCode === 77 ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return 'snow'
  }

  if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) {
    return 'lightning'
  }

  return 'cloud'
}
