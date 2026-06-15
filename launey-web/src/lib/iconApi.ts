const LOCAL_ICON_PREFIX = '/user-icons/'
const ICON_CACHE_PREFIX = '/icon-cache/'

export function isLocalUserIconPath(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith(LOCAL_ICON_PREFIX)
}

export function isCachedIconPath(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith(ICON_CACHE_PREFIX)
}

export function isStoredIconPath(value: string | undefined) {
  return typeof value === 'string' && /^\/(?!\/)/.test(value)
}

export function isBlobIconPath(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('blob:')
}

export async function uploadIcon(file: File) {
  const response = await fetch('/api/icons', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error('Не удалось загрузить иконку')
  }

  const payload = (await response.json()) as { path?: string }

  if (!isLocalUserIconPath(payload.path)) {
    throw new Error('Сервер вернул некорректный путь иконки')
  }

  return payload.path
}

export async function deleteIcon(path: string) {
  if (!isLocalUserIconPath(path)) {
    return
  }

  const response = await fetch('/api/icons', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  })

  if (!response.ok) {
    throw new Error('Не удалось удалить иконку')
  }
}

export async function cacheRemoteIcon(url: string) {
  const response = await fetch('/api/cache-icon', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ iconUrl: url }),
  })

  if (!response.ok) {
    throw new Error('Не удалось закешировать иконку')
  }

  const payload = (await response.json()) as { localIcon?: string; ok?: boolean }

  if (!isCachedIconPath(payload.localIcon)) {
    throw new Error('Сервер вернул некорректный путь иконки')
  }

  return payload.localIcon
}
