import type { MouseEventHandler, ReactNode } from 'react'
import './IconButton.css'

interface IconButtonProps {
  label: string
  children: ReactNode
  className?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
}

export function IconButton({
  label,
  children,
  className = 'icon-button',
  onClick,
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
