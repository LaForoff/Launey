import type { UpdateRelease } from '../../lib/updateService'
import { GlowSwap } from '../ui/GlowSwap'
import { Switch } from '../ui/Switch'

export type UpdateCardState = 'idle' | 'available'

interface UpdateCardProps {
  state: UpdateCardState
  release: UpdateRelease
  lastCheckedAt: string
  checkOnOpen: boolean
  isChecking: boolean
  hasChecked: boolean
  onCheck: () => void
  onShowChanges: () => void
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
                <span>{release.title}</span>
              </div>
              <div className="settings-update-actions">
                <button type="button" className="settings-inline-button" onClick={onShowChanges}>
                  Изменения
                </button>
                <button
                  type="button"
                  className="settings-inline-button modal-button-primary"
                  disabled
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
