const LOCAL_BACKGROUND_PREFIX = '/user-backgrounds/'

export function isLocalBackgroundPath(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith(LOCAL_BACKGROUND_PREFIX)
}

export async function uploadBackground(file: File) {
  const response = await fetch('/api/backgrounds', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error('Не удалось сохранить фон')
  }

  const payload = (await response.json()) as { path?: string }

  if (!isLocalBackgroundPath(payload.path)) {
    throw new Error('Сервер вернул некорректный путь фона')
  }

  return payload.path
}
