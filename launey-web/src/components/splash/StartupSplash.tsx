import { useEffect, useRef, useState, type CSSProperties, type TransitionEvent } from 'react'
import { APP_VERSION } from '../../config/buildInfo'
import { extractBackgroundPalette } from '../../lib/backgroundPalette'
import { loadAppSettingsFromLocalStorage } from '../../lib/settingsApi'
import { DottedLogo } from '../ui/DottedLogo'
import { FlowingGradientBackground } from '../widgets/FlowingGradientBackground'
import './StartupSplash.css'

const SPLASH_DEBUG = true
const PATH = [0, 3, 6, 7, 8] as const
const DOT_STAGGER_MS = SPLASH_DEBUG ? 90 : 90
const DOT_REVEAL_DURATION_MS = SPLASH_DEBUG ? 180 : 180
const LOGO_HOLD_MS = SPLASH_DEBUG ? 900 : 800
const MIN_SPLASH_MS = SPLASH_DEBUG ? 2600 : 2400
const EXIT_DELAY_MS = SPLASH_DEBUG ? 120 : 80
const EXIT_DURATION_MS = SPLASH_DEBUG ? 520 : 480
const BUILD_LABEL = `ver: ${APP_VERSION}`

interface StartupSplashProps {
  appReady: boolean
  onRevealStart: () => void
  onFinish: () => void
}

export function StartupSplash({ appReady, onRevealStart, onFinish }: StartupSplashProps) {
  const [startupBackground] = useState(() => loadAppSettingsFromLocalStorage()?.background ?? { type: 'default' as const })
  const [builtCount, setBuiltCount] = useState(0)
  const [logoRevealDone, setLogoRevealDone] = useState(false)
  const [minSplashDone, setMinSplashDone] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [flowColors, setFlowColors] = useState<readonly string[] | undefined>()
  const [isFlowPaletteReady, setIsFlowPaletteReady] = useState(startupBackground.type === 'default')
  const hasStartedRevealRef = useRef(false)
  const isIdle = logoRevealDone && !isTransitioning
  const canExitSplash = logoRevealDone && appReady && minSplashDone

  useEffect(() => {
    let isCancelled = false
    if (startupBackground.type === 'default') {
      return
    }

    void extractBackgroundPalette(startupBackground).then((palette) => {
      if (isCancelled) {
        return
      }
      if (palette) {
        setFlowColors(palette)
      }
      setIsFlowPaletteReady(true)
    })

    return () => {
      isCancelled = true
    }
  }, [startupBackground])

  useEffect(() => {
    const timers: number[] = []

    PATH.forEach((_, index) => {
      timers.push(
        window.setTimeout(() => {
          setBuiltCount(index + 1)
        }, index * DOT_STAGGER_MS),
      )
    })

    const revealCompleteMs = (PATH.length - 1) * DOT_STAGGER_MS + DOT_REVEAL_DURATION_MS

    timers.push(
      window.setTimeout(() => {
        setLogoRevealDone(true)
      }, revealCompleteMs + LOGO_HOLD_MS),
    )

    timers.push(
      window.setTimeout(() => {
        setMinSplashDone(true)
      }, MIN_SPLASH_MS),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    if (!canExitSplash || isTransitioning || hasStartedRevealRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      hasStartedRevealRef.current = true
      onRevealStart()
      setIsTransitioning(true)
    }, EXIT_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [canExitSplash, isTransitioning, onRevealStart])

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (!isTransitioning) {
      return
    }

    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') {
      return
    }

    onFinish()
  }

  return (
    <div
      className={isTransitioning ? 'startup-splash is-transitioning' : 'startup-splash'}
      aria-hidden="true"
      style={
        {
          '--startup-exit-duration': `${EXIT_DURATION_MS}ms`,
          '--startup-dot-reveal-duration': `${DOT_REVEAL_DURATION_MS}ms`,
        } as CSSProperties
      }
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="startup-splash__background" />
      {isFlowPaletteReady ? <FlowingGradientBackground colors={flowColors} /> : null}
      <div className="startup-splash__center">
        <DottedLogo
          className="startup-splash__logo-grid"
          gridSize={3}
          revealCount={builtCount}
          revealDurationMs={DOT_REVEAL_DURATION_MS}
          isIdle={isIdle}
        />
      </div>
      <div className="startup-splash__footer">
        <p className="startup-splash__brand">Launey</p>
        <p className="startup-splash__version">{BUILD_LABEL}</p>
      </div>
    </div>
  )
}

export const startupSplashTiming = {
  SPLASH_DEBUG,
  DOT_STAGGER_MS,
  DOT_REVEAL_DURATION_MS,
  LOGO_HOLD_MS,
  MIN_SPLASH_MS,
  EXIT_DELAY_MS,
  EXIT_DURATION_MS,
}
