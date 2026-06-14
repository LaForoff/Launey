import type { MouseEvent } from 'react'
import { DotsThreeOutline } from '@phosphor-icons/react'
import { IconButton } from '../ui/IconButton'
import './ActionBar.css'

interface ActionBarProps {
  onOpenSpaceMenu: (rect: DOMRect) => void
}

export function ActionBar({ onOpenSpaceMenu }: ActionBarProps) {
  function handleMoreClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onOpenSpaceMenu(event.currentTarget.getBoundingClientRect())
  }

  return (
    <div className="action-bar" aria-label="Действия">
      <IconButton className="space-settings-button" label="Ещё" onClick={handleMoreClick}>
        <DotsThreeOutline size={18} weight="fill" />
      </IconButton>
    </div>
  )
}
