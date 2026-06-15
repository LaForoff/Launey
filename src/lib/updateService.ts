import { APP_VERSION } from '../config/buildInfo'

export interface UpdateRelease {
  title: string
  version: string
  releaseNotes: string[]
  releaseNotesMarkdown: string
  publishedAt: string
  downloadUrl: string
  isUpdateAvailable: boolean
}

export interface UpdateProvider {
  checkForUpdates: () => Promise<UpdateRelease>
}

export interface StoredUpdateCheck {
  checkedAt: string
  release: UpdateRelease
}

export interface UpdateReminder {
  version: string
  skipLaunches: number
}

const COMPLETED_UPDATE_STORAGE_KEY = 'launey-completed-update'
const CURRENT_RELEASE_DETAILS_STORAGE_KEY = 'launey-current-release-details'
const LAST_UPDATE_CHECK_STORAGE_KEY = 'launey-last-update-check'
const UPDATE_REMINDER_STORAGE_KEY = 'launey-update-reminder'
const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/LaForoff/Launey/releases/latest'
const GITHUB_RELEASE_BY_TAG_URL = 'https://api.github.com/repos/LaForoff/Launey/releases/tags'

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
  title: 'Launey',
  version: APP_VERSION,
  releaseNotes: [
    'Добавлен раздел «Обновления» в настройках приложения.',
    'Добавлено отображение текущей версии приложения.',
    'Добавлено окно просмотра списка изменений.',
    'Улучшены анимации открытия и закрытия модальных окон.',
    'Переработаны переключатели в настройках.',
    'Улучшена визуальная структура разделов настроек.',
    'Исправлены проблемы с отображением blur-фона в модальных окнах.',
    'Исправлены визуальные артефакты при открытии интерфейсных элементов.',
  ],
  releaseNotesMarkdown: `
## Новое

- Добавлен раздел «Обновления» в настройках приложения.
- Добавлено отображение текущей версии приложения.
- Добавлено окно просмотра списка изменений.

## Улучшения

- Улучшены анимации открытия и закрытия модальных окон.
- Переработаны переключатели в настройках.
- Улучшена визуальная структура разделов настроек.

## Исправления

- Исправлены проблемы с отображением blur-фона в модальных окнах.
- Исправлены визуальные артефакты при открытии интерфейсных элементов.
`.trim(),
  publishedAt: '2026-06-01T10:00:00.000Z',
  downloadUrl: 'https://github.com/LaForoff/Launey/releases/tag/1.0.0',
  isUpdateAvailable: false,
}

export const githubUpdateProvider: UpdateProvider = {
  async checkForUpdates() {
    const latestRelease = await fetchGithubRelease(GITHUB_LATEST_RELEASE_URL)

    if (!latestRelease) {
      return {
        ...CURRENT_RELEASE,
        publishedAt: new Date().toISOString(),
      }
    }

    return latestRelease
  },
}

export async function getCurrentReleaseDetails() {
  const currentRelease = await fetchGithubRelease(`${GITHUB_RELEASE_BY_TAG_URL}/v${APP_VERSION}`)

  if (currentRelease) {
    const resolvedCurrentRelease = {
      ...currentRelease,
      isUpdateAvailable: false,
    }

    storeCurrentReleaseDetails(resolvedCurrentRelease)
    return resolvedCurrentRelease
  }

  const bareTagRelease = await fetchGithubRelease(`${GITHUB_RELEASE_BY_TAG_URL}/${APP_VERSION}`)

  if (bareTagRelease) {
    const resolvedCurrentRelease = {
      ...bareTagRelease,
      isUpdateAvailable: false,
    }

    storeCurrentReleaseDetails(resolvedCurrentRelease)
    return resolvedCurrentRelease
  }

  return getStoredCurrentReleaseDetails() ?? CURRENT_RELEASE
}

export function markUpdateCompleted(version: string) {
  window.localStorage.setItem(COMPLETED_UPDATE_STORAGE_KEY, version)
}

export function getCompletedUpdateRelease() {
  const completedVersion = window.localStorage.getItem(COMPLETED_UPDATE_STORAGE_KEY)
  return completedVersion === CURRENT_RELEASE.version ? CURRENT_RELEASE : null
}

export function clearCompletedUpdate() {
  window.localStorage.removeItem(COMPLETED_UPDATE_STORAGE_KEY)
}

export function getStoredUpdateCheck() {
  const rawSnapshot = window.localStorage.getItem(LAST_UPDATE_CHECK_STORAGE_KEY)

  if (!rawSnapshot) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as Partial<StoredUpdateCheck>

    if (
      typeof parsed.checkedAt !== 'string' ||
      !parsed.release ||
      typeof parsed.release !== 'object' ||
      typeof parsed.release.title !== 'string' ||
      typeof parsed.release.version !== 'string' ||
      !Array.isArray(parsed.release.releaseNotes) ||
      (typeof parsed.release.releaseNotesMarkdown !== 'string' && typeof parsed.release.releaseNotesMarkdown !== 'undefined') ||
      typeof parsed.release.publishedAt !== 'string' ||
      typeof parsed.release.downloadUrl !== 'string' ||
      typeof parsed.release.isUpdateAvailable !== 'boolean'
    ) {
      return null
    }

    return {
      checkedAt: parsed.checkedAt,
      release: {
        ...parsed.release,
        releaseNotesMarkdown:
          typeof parsed.release.releaseNotesMarkdown === 'string'
            ? parsed.release.releaseNotesMarkdown
            : parsed.release.releaseNotes.join('\n'),
      } as UpdateRelease,
    } satisfies StoredUpdateCheck
  } catch {
    return null
  }
}

export function storeUpdateCheck(snapshot: StoredUpdateCheck) {
  window.localStorage.setItem(LAST_UPDATE_CHECK_STORAGE_KEY, JSON.stringify(snapshot))
}

export function getStoredCurrentReleaseDetails() {
  const rawSnapshot = window.localStorage.getItem(CURRENT_RELEASE_DETAILS_STORAGE_KEY)

  if (!rawSnapshot) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as Partial<UpdateRelease>

    if (
      typeof parsed.title !== 'string' ||
      typeof parsed.version !== 'string' ||
      !Array.isArray(parsed.releaseNotes) ||
      typeof parsed.releaseNotesMarkdown !== 'string' ||
      typeof parsed.publishedAt !== 'string' ||
      typeof parsed.downloadUrl !== 'string' ||
      typeof parsed.isUpdateAvailable !== 'boolean'
    ) {
      return null
    }

    return parsed as UpdateRelease
  } catch {
    return null
  }
}

export function storeCurrentReleaseDetails(release: UpdateRelease) {
  window.localStorage.setItem(CURRENT_RELEASE_DETAILS_STORAGE_KEY, JSON.stringify(release))
}

export function getUpdateReminder() {
  const rawReminder = window.localStorage.getItem(UPDATE_REMINDER_STORAGE_KEY)

  if (!rawReminder) {
    return null
  }

  try {
    const parsed = JSON.parse(rawReminder) as Partial<UpdateReminder>

    if (typeof parsed.version !== 'string' || typeof parsed.skipLaunches !== 'number') {
      return null
    }

    return {
      version: parsed.version,
      skipLaunches: Math.max(0, Math.floor(parsed.skipLaunches)),
    } satisfies UpdateReminder
  } catch {
    return null
  }
}

export function setUpdateReminder(version: string, skipLaunches: number) {
  window.localStorage.setItem(
    UPDATE_REMINDER_STORAGE_KEY,
    JSON.stringify({
      version,
      skipLaunches: Math.max(0, Math.floor(skipLaunches)),
    } satisfies UpdateReminder),
  )
}

export function clearUpdateReminder() {
  window.localStorage.removeItem(UPDATE_REMINDER_STORAGE_KEY)
}

export function shouldSkipUpdateReminder(version: string) {
  const reminder = getUpdateReminder()

  if (!reminder) {
    return false
  }

  if (reminder.version !== version) {
    clearUpdateReminder()
    return false
  }

  if (reminder.skipLaunches <= 0) {
    return false
  }

  setUpdateReminder(version, reminder.skipLaunches - 1)
  return true
}

function normalizeVersion(version: string) {
  const normalizedVersion = extractVersion(version) ?? version

  return normalizedVersion
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

function extractVersion(value: string) {
  const match = value.trim().match(/\d+(?:\.\d+)+/)
  return match?.[0] ?? null
}

function parseReleaseNotes(body: string) {
  const parsedNotes = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*+]\s+/, ''))
    .map((line) => line.replace(/^\d+\.\s+/, ''))
    .filter((line) => !/^#+\s*/.test(line))

  return parsedNotes.length > 0 ? parsedNotes : ['Список изменений недоступен']
}

interface GithubLatestReleaseResponse {
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
}

async function fetchGithubRelease(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`github-release-http-${response.status}`)
  }

  const payload = (await response.json()) as Partial<GithubLatestReleaseResponse>

  if (
    typeof payload.tag_name !== 'string' ||
    typeof payload.body !== 'string' ||
    typeof payload.published_at !== 'string'
  ) {
    throw new Error('github-release-invalid-payload')
  }

  const version = extractVersion(payload.tag_name)

  if (!version) {
    throw new Error('github-release-invalid-version')
  }

  return {
    title: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : `Launey ${version}`,
    version,
    releaseNotes: parseReleaseNotes(payload.body),
    releaseNotesMarkdown: payload.body.trim() || 'Список изменений недоступен',
    publishedAt: payload.published_at,
    downloadUrl: typeof payload.html_url === 'string' ? payload.html_url : '',
    isUpdateAvailable: compareVersions(APP_VERSION, version) < 0,
  } satisfies UpdateRelease
}
