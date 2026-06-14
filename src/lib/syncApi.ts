import type { AppSettings } from './settingsApi'
import type { LauneyExportFile, LauneyExportSpace } from './launeySync'

interface ExportResponse {
  file: LauneyExportFile
}

interface ImportResponse {
  ok: boolean
  spaces: LauneyExportSpace[]
  activeSpaceId: string
  settings: AppSettings
  warnings?: string[]
}

export async function exportLauneyData(payload: {
  spaces: LauneyExportSpace[]
  activeSpaceId: string
  settings: AppSettings
}) {
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('export-failed')
  }

  const file = (await response.json()) as LauneyExportFile
  return { file } satisfies ExportResponse
}

export async function importLauneyData(file: LauneyExportFile) {
  const response = await fetch('/api/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file }),
  })

  if (!response.ok) {
    throw new Error('import-failed')
  }

  return (await response.json()) as ImportResponse
}

export function downloadLauneyExport(file: LauneyExportFile) {
  const datePart = new Date().toISOString().slice(0, 10)
  const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], {
    type: 'application/json',
  })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = `launey-export-${datePart}.launeyexport`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

