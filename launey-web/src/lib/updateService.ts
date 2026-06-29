import { APP_VERSION } from '../config/buildInfo'

export interface UpdateRelease {
  title: string
  version: string
  releaseNotes: string[]
  releaseNotesMarkdown: string
  publishedAt: string
  downloadUrl: string | null
  downloadSize: number | null
  downloadName: string | null
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
  downloadUrl: null,
  downloadSize: null,
  downloadName: null,
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
      (typeof parsed.release.downloadUrl !== 'string' && parsed.release.downloadUrl !== null) ||
      (typeof parsed.release.downloadSize !== 'number' &&
        parsed.release.downloadSize !== null &&
        typeof parsed.release.downloadSize !== 'undefined') ||
      (typeof parsed.release.downloadName !== 'string' &&
        parsed.release.downloadName !== null &&
        typeof parsed.release.downloadName !== 'undefined') ||
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
        downloadUrl:
          typeof parsed.release.downloadName === 'string' &&
          typeof parsed.release.downloadSize === 'number' &&
          typeof parsed.release.downloadUrl === 'string'
            ? parsed.release.downloadUrl
            : null,
        downloadSize:
          typeof parsed.release.downloadSize === 'number' ? parsed.release.downloadSize : null,
        downloadName:
          typeof parsed.release.downloadName === 'string' ? parsed.release.downloadName : null,
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
      (typeof parsed.downloadUrl !== 'string' && parsed.downloadUrl !== null) ||
      (typeof parsed.downloadSize !== 'number' &&
        parsed.downloadSize !== null &&
        typeof parsed.downloadSize !== 'undefined') ||
      (typeof parsed.downloadName !== 'string' &&
        parsed.downloadName !== null &&
        typeof parsed.downloadName !== 'undefined') ||
      typeof parsed.isUpdateAvailable !== 'boolean'
    ) {
      return null
    }

    return {
      ...parsed,
      downloadUrl:
        typeof parsed.downloadName === 'string' &&
        typeof parsed.downloadSize === 'number' &&
        typeof parsed.downloadUrl === 'string'
          ? parsed.downloadUrl
          : null,
      downloadSize: typeof parsed.downloadSize === 'number' ? parsed.downloadSize : null,
      downloadName: typeof parsed.downloadName === 'string' ? parsed.downloadName : null,
    } as UpdateRelease
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

export async function requestNativeUpdateCheck() {
  const response = await fetch('/api/updates/check', { method: 'POST' })

  if (!response.ok) {
    throw new Error('Native update check failed')
  }

  return response.json() as Promise<{ ok: true }>
}

export async function requestNativeUpdateStatus() {
  const response = await fetch('/api/updates/status')

  if (!response.ok) {
    throw new Error('Native update status failed')
  }

  const payload = (await response.json()) as { checking?: boolean | string }

  return {
    checking: payload.checking === true || payload.checking === 'true',
  }
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
  assets: GithubReleaseAsset[]
}

interface GithubReleaseAsset {
  name: string
  size: number
  browser_download_url: string
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
  const assets = Array.isArray(payload.assets) ? payload.assets : []
  const asset = selectDownloadAsset(assets)

  console.log('[updates] release', payload)
  console.log('[updates] assets', assets)
  console.log('[updates] selected asset', asset)

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
    downloadUrl: asset?.browser_download_url ?? null,
    downloadSize: asset?.size ?? null,
    downloadName: asset?.name ?? null,
    isUpdateAvailable: compareVersions(APP_VERSION, version) < 0,
  } satisfies UpdateRelease
}

function selectDownloadAsset(assets: GithubReleaseAsset[]) {
  const downloadableAssets = assets.filter(
    (asset) =>
      typeof asset?.name === 'string' &&
      typeof asset?.size === 'number' &&
      typeof asset?.browser_download_url === 'string',
  )

  return downloadableAssets.find((asset) => asset.name.toLowerCase().endsWith('.zip')) ??
    downloadableAssets[0] ??
    null
}

export function downloadUpdateAsset(release: UpdateRelease) {
  if (!release.downloadUrl) {
    throw new Error('update-download-url-missing')
  }

  console.log('[updates] download started')

  const anchor = document.createElement('a')

  anchor.href = release.downloadUrl
  anchor.download = release.downloadName?.trim() || 'Launey-update.zip'
  anchor.target = '_blank'
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}
