import { APP_VERSION } from '../config/buildInfo'

export interface UpdateRelease {
  version: string
  size: string
  releaseNotes: string[]
  publishedAt: string
  downloadUrl: string
  isUpdateAvailable: boolean
  downloadProgress: number
}

export interface UpdateProvider {
  checkForUpdates: () => Promise<UpdateRelease>
}

const COMPLETED_UPDATE_STORAGE_KEY = 'launey-completed-update'

export const MOCK_LATEST_VERSION = '1.0.0'

export function compareVersions(currentVersion: string, nextVersion: string) {
  const currentParts = normalizeVersion(currentVersion)
  const nextParts = normalizeVersion(nextVersion)
  const maxLength = Math.max(currentParts.length, nextParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const currentPart = currentParts[index] ?? 0
    const nextPart = nextParts[index] ?? 0

    if (currentPart < nextPart) {
      return -1
    }

    if (currentPart > nextPart) {
      return 1
    }
  }

  return 0
}

export const CURRENT_RELEASE: UpdateRelease = {
  version: APP_VERSION,
  size: '31,8 МБ',
  releaseNotes: [
    'Добавили перенос пространств, папок и URL между устройствами.',
    'Обновили оформление настроек и унифицировали модальные окна.',
    'Улучшили управление обоями и адаптивными акцентными цветами.',
    'Сделали анимации ярлыков и пространств более плавными.',
  ],
  publishedAt: '2026-06-01T10:00:00.000Z',
  downloadUrl: '',
  isUpdateAvailable: false,
  downloadProgress: 0,
}

export const MOCK_UPDATE_RELEASE: UpdateRelease = {
  version: MOCK_LATEST_VERSION,
  size: '32,4 МБ',
  releaseNotes: [
    'Добавили раздел обновлений с проверкой новых версий.',
    'Улучшили стабильность при переключении пространств.',
    'Сделали перемещение ярлыков после удаления более плавным.',
    'Унифицировали акцентные цвета ползунков и индикаторов прогресса.',
    'Исправили небольшие визуальные ошибки в окне настроек.',
    'Подготовили архитектуру для подключения GitHub Releases.',
  ],
  publishedAt: '2026-06-13T16:23:00.000Z',
  downloadUrl: 'https://github.com/launey/releases/download/v1.0.0/Launey.zip',
  isUpdateAvailable: compareVersions(APP_VERSION, MOCK_LATEST_VERSION) < 0,
  downloadProgress: 45.7,
}

export const mockUpdateProvider: UpdateProvider = {
  async checkForUpdates() {
    await new Promise((resolve) => window.setTimeout(resolve, 450))
    return {
      ...MOCK_UPDATE_RELEASE,
      isUpdateAvailable: compareVersions(APP_VERSION, MOCK_UPDATE_RELEASE.version) < 0,
    }
  },
}

export function markUpdateCompleted(version: string) {
  window.localStorage.setItem(COMPLETED_UPDATE_STORAGE_KEY, version)
}

export function getCompletedUpdateRelease() {
  const completedVersion = window.localStorage.getItem(COMPLETED_UPDATE_STORAGE_KEY)
  return completedVersion === MOCK_UPDATE_RELEASE.version ? MOCK_UPDATE_RELEASE : null
}

export function clearCompletedUpdate() {
  window.localStorage.removeItem(COMPLETED_UPDATE_STORAGE_KEY)
}

function normalizeVersion(version: string) {
  return version
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}
