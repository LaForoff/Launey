import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './modalMaterial.css'

interface ModalPortalProps {
  children: ReactNode
}

export function ModalPortal({ children }: ModalPortalProps) {
  if (typeof document === 'undefined') {
    return null
  }

  const modalRoot = document.getElementById('modal-root') ?? document.body

  return createPortal(<PreparedModalLayer>{children}</PreparedModalLayer>, modalRoot)
}

function PreparedModalLayer({ children }: ModalPortalProps) {
  const layerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const layer = layerRef.current

    if (!layer) {
      return
    }

    const pendingFrames = new Map<Element, [number, number | null]>()

    function prepareBackdrop(backdrop: Element) {
      if (pendingFrames.has(backdrop)) {
        return
      }

      backdrop.classList.add('modal-layer-preparing')

      const surfaces = backdrop.querySelectorAll<HTMLElement>(
        '.modal-surface, .add-url-modal, .settings-window, .folder-modal',
      )

      // Force style and geometry resolution while the layer is still effectively invisible.
      surfaces.forEach((surface) => {
        void surface.offsetWidth
        void window.getComputedStyle(surface).backdropFilter
      })

      const firstFrame = window.requestAnimationFrame(() => {
        surfaces.forEach((surface) => {
          void window.getComputedStyle(surface).backdropFilter
        })

        const secondFrame = window.requestAnimationFrame(() => {
          backdrop.classList.remove('modal-layer-preparing')
          pendingFrames.delete(backdrop)
        })

        pendingFrames.set(backdrop, [firstFrame, secondFrame])
      })

      pendingFrames.set(backdrop, [firstFrame, null])
    }

    function prepareAddedNode(node: Node) {
      if (!(node instanceof Element)) {
        return
      }

      if (node.matches('.modal-backdrop')) {
        prepareBackdrop(node)
      }

      node.querySelectorAll('.modal-backdrop').forEach(prepareBackdrop)
    }

    layer.childNodes.forEach(prepareAddedNode)

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(prepareAddedNode)
      })
    })

    observer.observe(layer, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      pendingFrames.forEach(([firstFrame, secondFrame], backdrop) => {
        window.cancelAnimationFrame(firstFrame)
        if (secondFrame !== null) {
          window.cancelAnimationFrame(secondFrame)
        }
        backdrop.classList.remove('modal-layer-preparing')
      })
      pendingFrames.clear()
    }
  }, [])

  return (
    <div ref={layerRef} className="modal-portal-layer">
      {children}
    </div>
  )
}
