import type { MouseEvent } from 'react'
import './Switch.css'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  className = '',
}: SwitchProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onChange(!checked)
  }

  return (
    <button
      className={['launey-switch', className].filter(Boolean).join(' ')}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleClick}
    >
      <span className="launey-switch-thumb" aria-hidden="true" />
    </button>
  )
}
