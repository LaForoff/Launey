import { useReducedMotion } from 'framer-motion'
import type { CSSProperties } from 'react'
import './DottedLogo.css'

const GRID_SIZE = 4
const TOTAL_DOTS = GRID_SIZE * GRID_SIZE
const LOGO_PATH = [0, 4, 8, 12, 13, 14, 15] as const

interface DottedLogoProps {
  className?: string
  revealCount?: number
  animate?: boolean
  staggerMs?: number
  revealDurationMs?: number
  isIdle?: boolean
}

export function DottedLogo({
  className = '',
  revealCount = LOGO_PATH.length,
  animate = false,
  staggerMs = 90,
  revealDurationMs = 180,
  isIdle = false,
}: DottedLogoProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const shouldAnimate = animate && !shouldReduceMotion

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
        } as CSSProperties
      }
    >
      {Array.from({ length: TOTAL_DOTS }, (_, dotIndex) => {
        const pathIndex = LOGO_PATH.indexOf(dotIndex as (typeof LOGO_PATH)[number])
        const isPathDot = pathIndex >= 0
        const isVisible = isPathDot && pathIndex < revealCount

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
