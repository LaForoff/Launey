import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface SubtleTiltCardProps {
  className?: string
  children: ReactNode
}

const TILT_X = [0, -0.7, 0.55, 0.9, -0.5, -0.85, 0]
const TILT_Y = [0, 0.95, -0.8, 0.65, 1, -0.7, 0]

export function SubtleTiltCard({ className, children }: SubtleTiltCardProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <motion.div
      className={className}
      animate={shouldReduceMotion ? { rotateX: 0, rotateY: 0 } : { rotateX: TILT_X, rotateY: TILT_Y }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : {
              duration: 20,
              ease: 'easeInOut',
              repeat: Infinity,
              repeatType: 'loop',
              times: [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1],
            }
      }
      style={{ transformPerspective: 1400, transformStyle: 'preserve-3d' }}
    >
      {children}
    </motion.div>
  )
}
