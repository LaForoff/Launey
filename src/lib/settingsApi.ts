import type { SpaceBackground } from '../types/space'

export interface SyncMeta {
  lastExportAt: string | null
  lastImportAt: string | null
}

export type AppearanceTheme = 'system' | 'light' | 'dark'

export interface AppSettings {
  appearanceTheme: AppearanceTheme
  backgroundBlur: number
  backgroundDim: number
  weatherLocation: string
  background: SpaceBackground
  syncMeta: SyncMeta
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearanceTheme: 'system',
  backgroundBlur: 0,
  backgroundDim: 0,
  weatherLocation: '',
  background: { type: 'default' },
  syncMeta: {
    lastExportAt: null,
    lastImportAt: null,
  },
}

const LEGACY_WEATHER_LOCATION = 'Russia, Moscow'

const UI_SETTINGS_STORAGE_KEY = 'launey-ui-settings-v1'
const UI_SYNC_META_STORAGE_KEY = 'launey-sync-meta-v1'

export async function loadAppSettings() {
  const response = await fetch('/api/settings')

  if (!response.ok) {
    throw new Error('Не удалось загрузить настройки')
  }

  const payload = (await response.json()) as AppSettings
  return sanitizeAppSettings(payload)
}

export async function saveAppSettings(settings: AppSettings) {
  const normalized = sanitizeAppSettings(settings)
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalized),
  })

  if (!response.ok) {
    throw new Error('Не удалось сохранить настройки')
  }

  const payload = (await response.json()) as AppSettings
  return sanitizeAppSettings(payload)
}

export function loadAppSettingsFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY)
    const rawSyncMeta = window.localStorage.getItem(UI_SYNC_META_STORAGE_KEY)
    if (!raw) {
      if (!rawSyncMeta) {
        return null
      }

      return sanitizeAppSettings({
        ...DEFAULT_APP_SETTINGS,
        syncMeta: JSON.parse(rawSyncMeta) as Partial<SyncMeta>,
      })
    }

    const parsedSettings = JSON.parse(raw) as Partial<AppSettings>
    const parsedSyncMeta = rawSyncMeta ? (JSON.parse(rawSyncMeta) as Partial<SyncMeta>) : undefined

    return sanitizeAppSettings({
      ...parsedSettings,
      syncMeta: parsedSyncMeta,
    })
  } catch {
    return null
  }
}

export function saveAppSettingsToLocalStorage(settings: AppSettings) {
  try {
    const sanitizedSettings = sanitizeAppSettings(settings)
    const { syncMeta, ...settingsWithoutSyncMeta } = sanitizedSettings
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(settingsWithoutSyncMeta))
    window.localStorage.setItem(UI_SYNC_META_STORAGE_KEY, JSON.stringify(syncMeta))
  } catch {
    // Ignore storage write failures.
  }
}

export function sanitizeAppSettings(
  payload: Partial<Omit<AppSettings, 'syncMeta'>> & { syncMeta?: Partial<SyncMeta> },
) {
  const rawWeatherLocation =
    typeof payload.weatherLocation === 'string' && payload.weatherLocation.trim()
      ? payload.weatherLocation.trim()
      : DEFAULT_APP_SETTINGS.weatherLocation
  const normalizedWeatherLocation =
    rawWeatherLocation.toLowerCase() === LEGACY_WEATHER_LOCATION.toLowerCase() ? '' : rawWeatherLocation

  return {
    appearanceTheme: sanitizeAppearanceTheme(payload.appearanceTheme),
    backgroundBlur: clampSetting(payload.backgroundBlur),
    backgroundDim: clampSetting(payload.backgroundDim),
    weatherLocation: normalizedWeatherLocation,
    background: sanitizeBackground(payload.background),
    syncMeta: sanitizeSyncMeta(payload.syncMeta),
  }
}

function sanitizeAppearanceTheme(value: AppearanceTheme | undefined): AppearanceTheme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function clampSetting(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

function sanitizeBackground(value: Partial<SpaceBackground> | undefined): SpaceBackground {
  if (!value || typeof value !== 'object') {
    return DEFAULT_APP_SETTINGS.background
  }

  const type = typeof value.type === 'string' ? value.type : 'default'
  const backgroundValue =
    'value' in value && typeof value.value === 'string' && value.value.trim() ? value.value.trim() : ''

  if (type === 'default') {
    return { type: 'default' }
  }

  if (
    (type === 'image-url' ||
      type === 'video-url' ||
      type === 'local-image' ||
      type === 'local-video') &&
    backgroundValue
  ) {
    if (type === 'local-image' || type === 'local-video') {
      const normalizedLocalBackground: Extract<
        SpaceBackground,
        { type: 'local-image' | 'local-video' }
      > = { type, value: backgroundValue }

      if ('fileName' in value && typeof value.fileName === 'string' && value.fileName.trim()) {
        return { ...normalizedLocalBackground, fileName: value.fileName.trim() }
      }

      return normalizedLocalBackground
    }

    return { type, value: backgroundValue }
  }

  return DEFAULT_APP_SETTINGS.background
}

function sanitizeSyncMeta(value: Partial<SyncMeta> | undefined): SyncMeta {
  if (!value || typeof value !== 'object') {
    return DEFAULT_APP_SETTINGS.syncMeta
  }

  return {
    lastExportAt: sanitizeIsoDate(value.lastExportAt),
    lastImportAt: sanitizeIsoDate(value.lastImportAt),
  }
}

function sanitizeIsoDate(value: string | null | undefined) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
