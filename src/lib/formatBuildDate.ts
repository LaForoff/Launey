export function formatDateTime(isoString: string | null) {
  if (!isoString) {
    return '—'
  }

  const date = new Date(isoString)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `${day}.${month}.${year} ${hours}:${minutes}`
}

export const formatBuildDate = formatDateTime
