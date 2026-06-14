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

export const CURRENT_RELEASE: UpdateRelease = {
  version: '1.0.0',
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
  version: '1.0.1',
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
  downloadUrl: 'https://github.com/launey/releases/download/v1.0.1/Launey.zip',
  isUpdateAvailable: true,
  downloadProgress: 45.7,
}

export const mockUpdateProvider: UpdateProvider = {
  async checkForUpdates() {
    await new Promise((resolve) => window.setTimeout(resolve, 450))
    return { ...MOCK_UPDATE_RELEASE }
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
