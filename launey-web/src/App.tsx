import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from './components/layout/Shell'
import { StartupSplash } from './components/splash/StartupSplash'
import { UpdateAvailableModal } from './components/widgets/UpdateAvailableModal'
import { WhatsNewOverlay } from './components/widgets/WhatsNewOverlay'
import { spaces } from './data/spaces'
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettingsFromLocalStorage,
} from './lib/settingsApi'
import {
  clearUpdateReminder,
  downloadUpdateAsset,
  githubUpdateProvider,
  setUpdateReminder,
  shouldSkipUpdateReminder,
  storeUpdateCheck,
  type UpdateRelease,
} from './lib/updateService'
import type { SettingsSection } from './components/widgets/SettingsWindow'
import './App.css'
import './styles/global.css'

type WhatsNewOpenOptions = {
  initialSlide?: number
  markAsSeen?: boolean
}

type WhatsNewRequest = {
  key: number
  markAsSeen: boolean
}

declare global {
  interface Window {
    launeyDebug?: {
      openWhatsNew?: (initialSlide?: number) => void
    }
  }
}

function App() {
  const [isSplashAnimationDone, setIsSplashAnimationDone] = useState(false)
  const [isAppRevealStarted, setIsAppRevealStarted] = useState(false)
  const [isBackgroundReady, setIsBackgroundReady] = useState(false)
  const [availableUpdate, setAvailableUpdate] = useState<UpdateRelease | null>(null)
  const [whatsNewRequest, setWhatsNewRequest] = useState<WhatsNewRequest | null>(null)
  const settingsOpenRequest: {
    key: number
    section: SettingsSection
  } | null = null
  const hasCheckedStartupUpdateRef = useRef(false)
  const isSplashVisible = useMemo(
    () => !(isSplashAnimationDone && isBackgroundReady),
    [isBackgroundReady, isSplashAnimationDone],
  )
  const shouldAutoFocusSearch = isAppRevealStarted && !isSplashVisible
  const openWhatsNew = useCallback(({ initialSlide = 0, markAsSeen = false }: WhatsNewOpenOptions = {}) => {
    void initialSlide
    setWhatsNewRequest((currentRequest) => ({
      key: (currentRequest?.key ?? 0) + 1,
      markAsSeen,
    }))
  }, [])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)

    if (searchParams.get('showWhatsNew') === '1') {
      openWhatsNew({ initialSlide: 0, markAsSeen: false })
    }
  }, [openWhatsNew])

  useEffect(() => {
    const previousDebug = window.launeyDebug
    window.launeyDebug = {
      ...previousDebug,
      openWhatsNew: (initialSlide = 0) => {
        openWhatsNew({ initialSlide, markAsSeen: false })
      },
    }

    return () => {
      if (previousDebug) {
        window.launeyDebug = previousDebug
        return
      }

      delete window.launeyDebug
    }
  }, [openWhatsNew])

  useEffect(() => {
    const settings = loadAppSettingsFromLocalStorage()
    const background = settings?.background

    if (
      !background ||
      background.type === 'default' ||
      background.type === 'video-url' ||
      background.type === 'local-video' ||
      !('value' in background) ||
      !background.value
    ) {
      setIsBackgroundReady(true)
      return
    }

    let isDone = false
    const done = () => {
      if (isDone) {
        return
      }
      isDone = true
      setIsBackgroundReady(true)
    }

    const preloadImage = new Image()
    preloadImage.decoding = 'async'
    preloadImage.loading = 'eager'
    preloadImage.onload = () => {
      if (typeof preloadImage.decode === 'function') {
        void preloadImage.decode().then(done).catch(done)
        return
      }
      done()
    }
    preloadImage.onerror = done
    preloadImage.src = background.value

    const fallbackTimer = window.setTimeout(done, 1200)

    return () => {
      window.clearTimeout(fallbackTimer)
    }
  }, [])

  useEffect(() => {
    if (isSplashVisible || hasCheckedStartupUpdateRef.current) {
      return
    }

    hasCheckedStartupUpdateRef.current = true

    const settings = loadAppSettingsFromLocalStorage() ?? DEFAULT_APP_SETTINGS

    if (!settings.checkUpdatesOnOpen) {
      return
    }

    let isCancelled = false

    void (async () => {
      try {
        const release = await githubUpdateProvider.checkForUpdates()
        const checkedAt = formatUpdateCheckDate(new Date())

        storeUpdateCheck({
          checkedAt,
          release,
        })

        if (!release.isUpdateAvailable || shouldSkipUpdateReminder(release.version) || isCancelled) {
          return
        }

        clearUpdateReminder()
        setAvailableUpdate(release)
      } catch {
        // Ignore startup update failures; manual check in settings remains available.
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [isSplashVisible])

  function handleRemindLater() {
    if (!availableUpdate) {
      return
    }

    setUpdateReminder(availableUpdate.version, 5)
    setAvailableUpdate(null)
  }

  function handleInstallNow() {
    if (!availableUpdate?.downloadUrl) {
      return
    }

    try {
      downloadUpdateAsset(availableUpdate)
      setAvailableUpdate(null)
    } catch (error) {
      console.error('[updates] download failed', error)
    }
  }

  return (
    <>
      <div className={isAppRevealStarted ? 'app-shell-stage is-revealed' : 'app-shell-stage'} aria-hidden={!isAppRevealStarted}>
        <Shell
          spaces={spaces}
          activeSpaceIndex={0}
          autoFocusSearch={shouldAutoFocusSearch}
          settingsOpenRequest={settingsOpenRequest}
          onOpenWhatsNew={() => openWhatsNew({ initialSlide: 0, markAsSeen: false })}
        />
      </div>
      {isSplashVisible ? (
        <StartupSplash
          appReady={isBackgroundReady}
          onRevealStart={() => setIsAppRevealStarted(true)}
          onFinish={() => setIsSplashAnimationDone(true)}
        />
      ) : null}
      {!isSplashVisible && availableUpdate ? (
        <UpdateAvailableModal
          release={availableUpdate}
          onRemindLater={handleRemindLater}
          onInstallNow={handleInstallNow}
          onClose={() => setAvailableUpdate(null)}
        />
      ) : null}
      {!isSplashVisible && whatsNewRequest ? (
        <WhatsNewOverlay
          key={whatsNewRequest.key}
          onClose={() => {
            setWhatsNewRequest(null)
          }}
        />
      ) : null}
    </>
  )
}

export default App

function formatUpdateCheckDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
