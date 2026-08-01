import { useReducedMotion } from 'framer-motion'
import type { CSSProperties } from 'react'
import './DottedLogo.css'

const LOGO_PATHS = {
  3: [0, 3, 6, 7, 8],
  4: [0, 4, 8, 12, 13, 14, 15],
} as const

interface DottedLogoProps {
  className?: string
  revealCount?: number
  animate?: boolean
  staggerMs?: number
  revealDurationMs?: number
  isIdle?: boolean
  gridSize?: 3 | 4
}

export function DottedLogo({
  className = '',
  revealCount,
  animate = false,
  staggerMs = 90,
  revealDurationMs = 180,
  isIdle = false,
  gridSize = 4,
}: DottedLogoProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const shouldAnimate = animate && !shouldReduceMotion
  const logoPath: readonly number[] = LOGO_PATHS[gridSize]
  const totalDots = gridSize * gridSize
  const visibleDotCount = revealCount ?? logoPath.length

  return (
    <span
      className={[
        'dotted-logo',
        shouldAnimate ? 'is-animating' : '',
        isIdle ? 'is-idle' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      style={
        {
          '--dotted-logo-stagger': `${staggerMs}ms`,
          '--dotted-logo-reveal-duration': `${revealDurationMs}ms`,
          '--dotted-logo-grid-size': gridSize,
        } as CSSProperties
      }
    >
      {Array.from({ length: totalDots }, (_, dotIndex) => {
        const pathIndex = logoPath.indexOf(dotIndex)
        const isPathDot = pathIndex >= 0
        const isVisible = isPathDot && pathIndex < visibleDotCount

        return (
          <span
            key={dotIndex}
            className={[
              'dotted-logo-dot',
              isPathDot ? 'is-path' : '',
              isVisible ? 'is-visible' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              isPathDot
                ? ({ '--dotted-logo-index': pathIndex } as CSSProperties)
                : undefined
            }
          />
        )
      })}
    </span>
  )
}
