import { Check, DownloadSimple } from '@phosphor-icons/react'
import type { CSSProperties } from 'react'
import type { UpdateRelease } from '../../lib/updateService'
import { GlowSwap } from '../ui/GlowSwap'
import { Switch } from '../ui/Switch'

export type UpdateCardState = 'idle' | 'available'
export type UpdateCardVisualState = 'idle' | 'latest' | 'available'

interface UpdateCardProps {
  state: UpdateCardVisualState
  release: UpdateRelease
  lastCheckedAt: string | null
  checkOnOpen: boolean
  isChecking: boolean
  isDownloading: boolean
  downloadedBytes: number
  downloadTotalBytes: number | null
  onCheck: () => void
  onInstall: () => void
  onShowChanges: () => void
  onToggleCheckOnOpen: () => void
}

export function UpdateCard({
  state,
  release,
  lastCheckedAt,
  checkOnOpen,
  isChecking,
  isDownloading,
  downloadedBytes,
  downloadTotalBytes,
  onCheck,
  onInstall,
  onShowChanges,
  onToggleCheckOnOpen,
}: UpdateCardProps) {
  return (
    <article className="settings-card settings-update-card">
      <div className="settings-update-card-main">
        <GlowSwap
          swapKey={isDownloading ? 'downloading' : state}
          className="settings-update-state"
        >
          {isDownloading ? (
            <div className="settings-update-download">
              <div className="settings-update-download-meta">
                <strong>
                  <DownloadSimple size={15} weight="bold" />
                  Скачивание Launey {release.version}
                </strong>
                <span>{formatDownloadProgress(downloadedBytes, downloadTotalBytes)}</span>
              </div>
              <div
                className={
                  downloadTotalBytes
                    ? 'settings-update-progress'
                    : 'settings-update-progress is-indeterminate'
                }
                role="progressbar"
                aria-label="Скачивание обновления"
                aria-valuemin={0}
                aria-valuemax={downloadTotalBytes ?? undefined}
                aria-valuenow={downloadTotalBytes ? downloadedBytes : undefined}
              >
                <span
                  className="settings-update-progress-fill"
                  style={
                    {
                      '--settings-update-progress': downloadTotalBytes
                        ? `${Math.min(100, (downloadedBytes / downloadTotalBytes) * 100)}%`
                        : '36%',
                    } as CSSProperties
                  }
                />
              </div>
            </div>
          ) : null}

          {!isDownloading && state === 'idle' ? (
            <>
              <div className="settings-update-copy">
                <strong>Проверить наличие обновлений</strong>
                <span>
                  {lastCheckedAt
                    ? `Последняя проверка: ${lastCheckedAt}`
                    : 'Последняя проверка ещё не выполнялась'}
                </span>
              </div>
              <button
                type="button"
                className="settings-inline-button"
                disabled={isChecking}
                onClick={onCheck}
                aria-label={isChecking ? 'Проверка обновлений' : 'Проверить обновления'}
              >
                {isChecking ? <span className="settings-update-loader" aria-hidden="true" /> : 'Проверить'}
              </button>
            </>
          ) : null}

          {!isDownloading && state === 'latest' ? (
            <>
              <div className="settings-update-status">
                <span className="settings-update-status-icon" aria-hidden="true">
                  <span className="settings-update-status-icon-disc">
                    <Check size={13} weight="bold" />
                  </span>
                </span>
                <div className="settings-update-copy">
                  <strong>Последняя версия установлена</strong>
                  <span>Launey {release.version}</span>
                </div>
              </div>
              <button
                type="button"
                className="settings-inline-button"
                disabled={isChecking}
                onClick={onCheck}
                aria-label={isChecking ? 'Проверка обновлений' : 'Проверить обновления'}
              >
                {isChecking ? <span className="settings-update-loader" aria-hidden="true" /> : 'Проверить'}
              </button>
            </>
          ) : null}

          {!isDownloading && state === 'available' ? (
            <>
              <div className="settings-update-copy">
                <strong>Launey {release.version}</strong>
                <span>{release.title}</span>
              </div>
              <div className="settings-update-actions">
                <button type="button" className="settings-inline-button" onClick={onShowChanges}>
                  Изменения
                </button>
                <button
                  type="button"
                  className="settings-inline-button modal-button-primary"
                  disabled={!release.downloadUrl}
                  onClick={onInstall}
                >
                  Установить
                </button>
              </div>
            </>
          ) : null}
        </GlowSwap>
      </div>

      <div className="settings-update-divider" />

      <div className="frame-toggle-row settings-update-toggle">
        <span>Проверять при открытии</span>
        <Switch
          checked={checkOnOpen}
          onChange={onToggleCheckOnOpen}
          ariaLabel="Проверять обновления при открытии"
        />
      </div>
    </article>
  )
}

function formatDownloadProgress(downloadedBytes: number, totalBytes: number | null) {
  const downloaded = formatFileSize(downloadedBytes)
  return totalBytes ? `${downloaded} / ${formatFileSize(totalBytes)}` : downloaded
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1_000_000).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} МБ`
}
