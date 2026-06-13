import { useEffect, useMemo, useState } from 'react'
import { Shell } from './components/layout/Shell'
import { StartupSplash } from './components/splash/StartupSplash'
import { PostUpdateModal } from './components/widgets/PostUpdateModal'
import { spaces } from './data/spaces'
import { loadAppSettingsFromLocalStorage } from './lib/settingsApi'
import { getCompletedUpdateRelease, type UpdateRelease } from './lib/updateService'
import './App.css'
import './styles/global.css'

function App() {
  const [isSplashAnimationDone, setIsSplashAnimationDone] = useState(false)
  const [isAppRevealStarted, setIsAppRevealStarted] = useState(false)
  const [isBackgroundReady, setIsBackgroundReady] = useState(false)
  const [completedUpdate, setCompletedUpdate] = useState<UpdateRelease | null>(() =>
    getCompletedUpdateRelease(),
  )
  const isSplashVisible = useMemo(
    () => !(isSplashAnimationDone && isBackgroundReady),
    [isBackgroundReady, isSplashAnimationDone],
  )
  const shouldAutoFocusSearch = isAppRevealStarted && !isSplashVisible

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

  return (
    <>
      <div className={isAppRevealStarted ? 'app-shell-stage is-revealed' : 'app-shell-stage'} aria-hidden={!isAppRevealStarted}>
        <Shell spaces={spaces} activeSpaceIndex={0} autoFocusSearch={shouldAutoFocusSearch} />
      </div>
      {isSplashVisible ? (
        <StartupSplash
          appReady={isBackgroundReady}
          onRevealStart={() => setIsAppRevealStarted(true)}
          onFinish={() => setIsSplashAnimationDone(true)}
        />
      ) : null}
      {!isSplashVisible && completedUpdate ? (
        <PostUpdateModal release={completedUpdate} onClose={() => setCompletedUpdate(null)} />
      ) : null}
    </>
  )
}

export default App
