import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

interface GlowSwapProps {
  swapKey: string
  children: ReactNode
  className?: string
  as?: 'div' | 'span'
}

const GLOW_SWAP_EASE = [0.22, 1, 0.36, 1] as const

export function GlowSwap({
  swapKey,
  children,
  className,
  as = 'div',
}: GlowSwapProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const Component = as === 'span' ? motion.span : motion.div
  const motionProps = shouldReduceMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.08 },
      }
    : {
        initial: {
          opacity: 0,
          scale: 0.975,
          filter: 'blur(8px) drop-shadow(0 0 14px rgba(255, 255, 255, 0.12))',
        },
        animate: {
          opacity: 1,
          scale: 1,
          filter: 'blur(0px) drop-shadow(0 0 0 rgba(255, 255, 255, 0))',
        },
        exit: {
          opacity: 0,
          scale: 0.975,
          filter: 'blur(10px) drop-shadow(0 0 18px rgba(255, 255, 255, 0.14))',
        },
        transition: {
          duration: 0.24,
          ease: GLOW_SWAP_EASE,
          opacity: { duration: 0.18 },
        },
      }

  return (
    <AnimatePresence initial={false} mode="wait">
      <Component key={swapKey} className={className} {...motionProps}>
        {children}
      </Component>
    </AnimatePresence>
  )
}
