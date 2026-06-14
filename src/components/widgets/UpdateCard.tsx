import type { CSSProperties } from 'react'
import type { UpdateRelease } from '../../lib/updateService'
import { GlowSwap } from '../ui/GlowSwap'
import { Switch } from '../ui/Switch'

export type UpdateCardState = 'idle' | 'available' | 'downloading'

interface UpdateCardProps {
  state: UpdateCardState
  release: UpdateRelease
  lastCheckedAt: string
  checkOnOpen: boolean
  isChecking: boolean
  hasChecked: boolean
  onCheck: () => void
  onShowChanges: () => void
  onInstall: () => void
  onToggleCheckOnOpen: () => void
}

export function UpdateCard({
  state,
  release,
  lastCheckedAt,
  checkOnOpen,
  isChecking,
  hasChecked,
  onCheck,
  onShowChanges,
  onInstall,
  onToggleCheckOnOpen,
}: UpdateCardProps) {
  return (
    <article className="settings-card settings-update-card">
      <div className="settings-update-card-main">
        <GlowSwap
          swapKey={state}
          className="settings-update-state"
        >
          {state === 'idle' ? (
            <>
              <div className="settings-update-copy">
                <strong>{hasChecked ? 'Обновлений нет' : 'Проверить наличие обновлений'}</strong>
                <span>Последняя проверка: {lastCheckedAt}</span>
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

          {state === 'available' ? (
            <>
              <div className="settings-update-copy">
                <strong>Launey {release.version}</strong>
                <span>Вес: {release.size}</span>
              </div>
              <div className="settings-update-actions">
                <button type="button" className="settings-inline-button" onClick={onShowChanges}>
                  Изменения
                </button>
                <button
                  type="button"
                  className="settings-inline-button modal-button-primary"
                  onClick={onInstall}
                >
                  Установить
                </button>
              </div>
            </>
          ) : null}

          {state === 'downloading' ? (
            <div className="settings-update-download">
              <div className="settings-update-download-meta">
                <strong>Launey {release.version}</strong>
                <span>{formatDownloadedSize(release.size, release.downloadProgress)} / {release.size}</span>
              </div>
              <div
                className="settings-update-progress"
                role="progressbar"
                aria-label={`Скачивание Launey ${release.version}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={release.downloadProgress}
              >
                <span
                  className="settings-update-progress-fill"
                  style={{ '--settings-update-progress': `${release.downloadProgress}%` } as CSSProperties}
                />
              </div>
            </div>
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

function formatDownloadedSize(sizeLabel: string, progress: number) {
  const totalSize = Number.parseFloat(sizeLabel.replace(',', '.'))

  if (Number.isNaN(totalSize)) {
    return '0 МБ'
  }

  return `${(totalSize * progress / 100).toFixed(1).replace('.', ',')} МБ`
}
