import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './modalMaterial.css'

interface ModalPortalProps {
  children: ReactNode
}

export function ModalPortal({ children }: ModalPortalProps) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(children, document.body)
}
