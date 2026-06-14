import { APP_VERSION } from '../config/buildInfo'

export interface UpdateRelease {
  title: string
  version: string
  releaseNotes: string[]
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

const COMPLETED_UPDATE_STORAGE_KEY = 'launey-completed-update'
const LAST_UPDATE_CHECK_STORAGE_KEY = 'launey-last-update-check'
const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/LaForoff/Launey/releases/latest'

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
    'Добавили перенос пространств, папок и URL между устройствами.',
    'Обновили оформление настроек и унифицировали модальные окна.',
    'Улучшили управление обоями и адаптивными акцентными цветами.',
    'Сделали анимации ярлыков и пространств более плавными.',
  ],
  publishedAt: '2026-06-01T10:00:00.000Z',
  downloadUrl: '',
  isUpdateAvailable: false,
}

export const githubUpdateProvider: UpdateProvider = {
  async checkForUpdates() {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })

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
      publishedAt: payload.published_at,
      downloadUrl: typeof payload.html_url === 'string' ? payload.html_url : '',
      isUpdateAvailable: compareVersions(APP_VERSION, version) < 0,
    }
  },
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
      typeof parsed.release.publishedAt !== 'string' ||
      typeof parsed.release.downloadUrl !== 'string' ||
      typeof parsed.release.isUpdateAvailable !== 'boolean'
    ) {
      return null
    }

    return {
      checkedAt: parsed.checkedAt,
      release: parsed.release,
    } satisfies StoredUpdateCheck
  } catch {
    return null
  }
}

export function storeUpdateCheck(snapshot: StoredUpdateCheck) {
  window.localStorage.setItem(LAST_UPDATE_CHECK_STORAGE_KEY, JSON.stringify(snapshot))
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
