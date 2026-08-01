import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ImageSquare, MagnifyingGlass, MagicWand, X } from '@phosphor-icons/react'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'
import './IconSettingsModal.css'

type IconSettingsTab = 'appstore' | 'custom' | 'global'
type AppStoreCountry = 'us' | 'ru'

interface AppStoreIconResult {
  iconUrl: string
  appUrl: string
  title: string
  score: number
}

interface AppStoreSearchPayload {
  ok: boolean
  results?: AppStoreIconResult[]
  error?: string
}

interface SiteIconResult {
  id: string
  type: 'apple-touch-icon' | 'manifest' | 'og-image' | 'favicon' | 'google-favicon' | 'generated'
  url: string
  previewUrl: string
  source: string
  score: number
}

interface SiteIconSearchPayload {
  ok: boolean
  candidates?: SiteIconResult[]
  error?: string
}

type GlobalSearchState = {
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error'
  results: SiteIconResult[]
}

const GLOBAL_SITE_ICONS_CACHE_TTL_MS = 1000 * 60 * 30
const MINIMUM_GLOBAL_ICON_SIZE = 64
const MINIMUM_GLOBAL_ICON_ASPECT_RATIO = 0.75
const MAXIMUM_GLOBAL_ICON_ASPECT_RATIO = 1.33
const globalSiteIconsCache = new Map<string, { expiresAt: number; state: GlobalSearchState }>()

interface IconSettingsResult {
  iconUrl?: string
  iconFile?: File
  previewSrc?: string
  iconSource?: 'appstore' | 'site' | 'generated' | 'custom'
}

interface IconSettingsModalProps {
  isOpen: boolean
  title: string
  url: string
  initialIcon?: string
  onClose: () => void
  onSave: (result: IconSettingsResult) => void | Promise<void>
}

export function IconSettingsModal({ isOpen, title, url, initialIcon, onClose, onSave }: IconSettingsModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen ? (
          <IconSettingsModalContent
            key={title || 'icon-settings'}
            title={title}
            url={url}
            initialIcon={initialIcon}
            onClose={onClose}
            onSave={onSave}
            shouldReduceMotion={shouldReduceMotion}
          />
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}

interface IconSettingsModalContentProps {
  title: string
  url: string
  initialIcon?: string
  onClose: () => void
  onSave: (result: IconSettingsResult) => void | Promise<void>
  shouldReduceMotion: boolean
}

function IconSettingsModalContent({
  title,
  url,
  initialIcon,
  onClose,
  onSave,
  shouldReduceMotion,
}: IconSettingsModalContentProps) {
  const titleId = useId()
  const fileId = useId()
  const [activeTab, setActiveTab] = useState<IconSettingsTab>('appstore')
  const [searchTitle, setSearchTitle] = useState(title)
  const [country, setCountry] = useState<AppStoreCountry>('us')
  const [searchStateByCountry, setSearchStateByCountry] = useState<
    Record<AppStoreCountry, { status: 'idle' | 'loading' | 'success' | 'empty' | 'error'; results: AppStoreIconResult[] }>
  >({
    us: { status: 'idle', results: [] },
    ru: { status: 'idle', results: [] },
  })
  const [globalState, setGlobalState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'empty' | 'error'
    results: SiteIconResult[]
  }>({
    status: 'idle',
    results: [],
  })
  const [validGlobalResultIds, setValidGlobalResultIds] = useState<Set<string>>(() => new Set())
  const [rejectedGlobalResultIds, setRejectedGlobalResultIds] = useState<Set<string>>(() => new Set())
  const globalQueryRef = useRef<string>('')
  const [selectedIconUrl, setSelectedIconUrl] = useState<string | undefined>(
    initialIcon && /^https?:\/\//i.test(initialIcon) ? initialIcon : undefined,
  )
  const [selectedIconFile, setSelectedIconFile] = useState<File | undefined>()
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const requestIdRef = useRef(0)

  const trimmedTitle = searchTitle.trim()
  const trimmedUrl = url.trim()
  const selectedCountryState =
    trimmedTitle.length >= 2 ? searchStateByCountry[country] : { status: 'idle' as const, results: [] }
  const hasSelection = Boolean(selectedIconUrl || selectedIconFile)
  const visibleGlobalResults = globalState.results.filter((result) => !rejectedGlobalResultIds.has(result.id))
  const validatedGlobalResults = visibleGlobalResults.filter((result) => validGlobalResultIds.has(result.id))
  const isValidatingGlobalResults =
    globalState.status === 'success' &&
    validGlobalResultIds.size + rejectedGlobalResultIds.size < globalState.results.length

  const sortedResults = useMemo(
    () => [...selectedCountryState.results].sort((first, second) => second.score - first.score),
    [selectedCountryState.results],
  )

  useEffect(() => {
    return () => {
      if (selectedFilePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(selectedFilePreview)
      }
    }
  }, [selectedFilePreview])

  useEffect(() => {
    if (activeTab !== 'appstore') {
      return
    }

    if (trimmedTitle.length < 2) {
      requestIdRef.current += 1
      return
    }

    requestIdRef.current += 1
    const requestId = requestIdRef.current
    const abortController = new AbortController()
    const searchTimer = window.setTimeout(() => {
      setSearchStateByCountry((current) => ({
        ...current,
        [country]: { status: 'loading', results: [] },
      }))

      void fetch(`/api/app-store-icon?query=${encodeURIComponent(trimmedTitle)}&country=${country}`, {
        signal: abortController.signal,
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('search-failed')
        }

        const payload = (await response.json()) as AppStoreSearchPayload

        if (requestId !== requestIdRef.current) {
          return
        }

        const results = payload.results ?? []

        setSearchStateByCountry((current) => ({
          ...current,
          [country]: {
            status: payload.ok && results.length > 0 ? 'success' : 'empty',
            results: payload.ok ? results : [],
          },
        }))
      })
      .catch(() => {
        if (requestId !== requestIdRef.current || abortController.signal.aborted) {
          return
        }

        setSearchStateByCountry((current) => ({
          ...current,
          [country]: {
            status: 'error',
            results: [],
          },
        }))
      })
    }, 250)

    return () => {
      window.clearTimeout(searchTimer)
      abortController.abort()
    }
  }, [activeTab, country, trimmedTitle])

  useEffect(() => {
    if (activeTab !== 'global') {
      return
    }

    if (!trimmedUrl) {
      setGlobalState({ status: 'idle', results: [] })
      return
    }

    const cached = globalSiteIconsCache.get(trimmedUrl)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      setGlobalState(cached.state)
      globalQueryRef.current = trimmedUrl
      return
    }

    if (globalQueryRef.current === trimmedUrl && globalState.status !== 'error') {
      return
    }

    globalQueryRef.current = trimmedUrl
    requestIdRef.current += 1
    const requestId = requestIdRef.current

    setGlobalState({ status: 'loading', results: [] })
    setValidGlobalResultIds(new Set())
    setRejectedGlobalResultIds(new Set())

    void fetch(`/api/site-icons?url=${encodeURIComponent(trimmedUrl)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('site-search-failed')
        }

        const payload = (await response.json()) as SiteIconSearchPayload
        if (requestId !== requestIdRef.current) {
          return
        }

        const results = payload.candidates ?? []
        const nextState: GlobalSearchState = {
          status: payload.ok && results.length > 0 ? 'success' : 'empty',
          results: payload.ok ? results : [],
        }
        if (nextState.status === 'success') {
          globalSiteIconsCache.set(trimmedUrl, {
            expiresAt: Date.now() + GLOBAL_SITE_ICONS_CACHE_TTL_MS,
            state: nextState,
          })
        } else {
          globalSiteIconsCache.delete(trimmedUrl)
        }
        setGlobalState(nextState)
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) {
          return
        }

        const failedState: GlobalSearchState = { status: 'error', results: [] }
        globalSiteIconsCache.delete(trimmedUrl)
        setGlobalState(failedState)
      })
  }, [activeTab, globalState.status, trimmedUrl])

  function handleCustomIconChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (selectedFilePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(selectedFilePreview)
    }

    const nextPreview = URL.createObjectURL(file)
    setSelectedIconFile(file)
    setSelectedFilePreview(nextPreview)
    setSelectedIconUrl(undefined)
  }

  function handleGlobalIconLoad(result: SiteIconResult, image: HTMLImageElement) {
    const width = image.naturalWidth
    const height = image.naturalHeight
    const aspectRatio = height > 0 ? width / height : 0
    const isUsable =
      width >= MINIMUM_GLOBAL_ICON_SIZE &&
      height >= MINIMUM_GLOBAL_ICON_SIZE &&
      aspectRatio >= MINIMUM_GLOBAL_ICON_ASPECT_RATIO &&
      aspectRatio <= MAXIMUM_GLOBAL_ICON_ASPECT_RATIO

    if (!isUsable) {
      rejectGlobalIcon(result)
      return
    }

    setValidGlobalResultIds((current) => {
      const next = new Set(current)
      next.add(result.id)
      return next
    })
  }

  function rejectGlobalIcon(result: SiteIconResult) {
    setRejectedGlobalResultIds((current) => {
      const next = new Set(current)
      next.add(result.id)
      return next
    })

    if (selectedIconUrl === result.previewUrl) {
      setSelectedIconUrl(undefined)
    }
  }

  async function handleSave() {
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)

    if (selectedIconFile && selectedFilePreview) {
      try {
        await onSave({ iconFile: selectedIconFile, previewSrc: selectedFilePreview, iconSource: 'custom' })
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    if (selectedIconUrl) {
      if (activeTab === 'global') {
        const selected = globalState.results.find((item) => item.previewUrl === selectedIconUrl)
        try {
          await onSave({
            iconUrl: selectedIconUrl,
            previewSrc: selectedIconUrl,
            iconSource: selected?.type === 'generated' ? 'generated' : 'site',
          })
        } finally {
          setIsSubmitting(false)
        }
        return
      }

      try {
        await onSave({ iconUrl: selectedIconUrl, previewSrc: selectedIconUrl, iconSource: 'appstore' })
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    setIsSubmitting(false)
  }

  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      {...getModalBackdropAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
    >
      <motion.section
        className="add-url-modal icon-settings-modal"
        aria-labelledby={titleId}
        {...getCenteredModalAnimation(shouldReduceMotion)}
        transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
      >
        <div className="modal-header icon-settings-header">
          <h2 id={titleId}>Настроить иконку</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <p className="icon-settings-caption">
          <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />
          <span>Поиск иконки для названия:</span>
        </p>
        <input
          className="modal-input icon-settings-name-input"
          value={searchTitle}
          onChange={(event) => setSearchTitle(event.target.value)}
          placeholder="Название"
          aria-label="Название для поиска иконки"
          autoComplete="off"
        />

        <div className="icon-settings-tabs" role="tablist" aria-label="Выбор источника иконки">
          <button
            type="button"
            className={activeTab === 'appstore' ? 'icon-settings-tab is-active' : 'icon-settings-tab'}
            onClick={() => setActiveTab('appstore')}
          >
            <MagicWand size={12} weight="fill" aria-hidden="true" />
            <span>AppStore</span>
          </button>
          <button
            type="button"
            className={activeTab === 'custom' ? 'icon-settings-tab is-active' : 'icon-settings-tab'}
            onClick={() => setActiveTab('custom')}
          >
            <ImageSquare size={12} weight="fill" aria-hidden="true" />
            <span>Своя иконка</span>
          </button>
          <button
            type="button"
            className={activeTab === 'global' ? 'icon-settings-tab is-active' : 'icon-settings-tab'}
            onClick={() => setActiveTab('global')}
          >
            <MagnifyingGlass size={12} weight="bold" aria-hidden="true" />
            <span>Глобальный поиск</span>
          </button>
        </div>

        {activeTab === 'appstore' ? (
          <section className="icon-settings-appstore">
            <div className="icon-settings-country">
              <button
                type="button"
                className={country === 'us' ? 'icon-country-button is-active' : 'icon-country-button'}
                onClick={() => setCountry('us')}
              >
                USA
              </button>
              <button
                type="button"
                className={country === 'ru' ? 'icon-country-button is-active' : 'icon-country-button'}
                onClick={() => setCountry('ru')}
              >
                RU
              </button>
            </div>

            <div className="icon-settings-results">
              {selectedCountryState.status === 'loading' || selectedCountryState.status === 'idle' ? (
                <>
                  <p className="icon-results-text">
                    <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />
                    <span>Идёт поиск…</span>
                  </p>
                  <div className="icon-results-grid">
                    {Array.from({ length: 15 }).map((_, index) => (
                      <span className="icon-result-skeleton" key={index} />
                    ))}
                  </div>
                </>
              ) : null}

              {selectedCountryState.status === 'success' ? (
                <>
                  <p className="icon-results-text">Найдено подходящих результатов: {sortedResults.length}</p>
                  <div className="icon-results-grid">
                    {sortedResults.map((result) => (
                      <button
                        type="button"
                        key={`${result.appUrl}-${result.iconUrl}`}
                        className={
                          selectedIconUrl === result.iconUrl
                            ? 'icon-result-button is-selected'
                            : 'icon-result-button'
                        }
                        onClick={() => {
                          setSelectedIconUrl(result.iconUrl)
                          setSelectedIconFile(undefined)
                          setSelectedFilePreview(undefined)
                        }}
                      >
                        <img src={result.iconUrl} alt={result.title} />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {selectedCountryState.status === 'empty' ? <p className="icon-results-text">Найдено подходящих результатов: 0</p> : null}

              {selectedCountryState.status === 'error' ? (
                <p className="icon-results-text">Не удалось выполнить поиск</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === 'global' ? (
          <section className="icon-settings-appstore">
            <div className="icon-settings-results">
              {!trimmedUrl ? (
                <p className="icon-results-text">Добавьте URL, чтобы искать иконку сайта</p>
              ) : null}

              {trimmedUrl && (globalState.status === 'loading' || globalState.status === 'idle') ? (
                <>
                  <p className="icon-results-text">
                    <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />
                    <span>Идёт поиск…</span>
                  </p>
                  <div className="icon-results-grid">
                    {Array.from({ length: 15 }).map((_, index) => (
                      <span className="icon-result-skeleton" key={`global-${index}`} />
                    ))}
                  </div>
                </>
              ) : null}

              {globalState.status === 'success' ? (
                <>
                  <p className="icon-results-text">
                    {isValidatingGlobalResults
                      ? 'Проверяем качество иконок…'
                      : `Найдено подходящих результатов: ${validatedGlobalResults.length}`}
                  </p>
                  <div className="icon-results-grid">
                    {visibleGlobalResults.map((result) => (
                      <button
                        type="button"
                        key={result.id}
                        className={`${
                          selectedIconUrl === result.previewUrl
                            ? 'icon-result-button is-selected'
                            : 'icon-result-button'
                        }${validGlobalResultIds.has(result.id) ? '' : ' is-validating'}`}
                        onClick={() => {
                          setSelectedIconUrl(result.previewUrl)
                          setSelectedIconFile(undefined)
                          setSelectedFilePreview(undefined)
                        }}
                        title={result.source}
                      >
                        <img
                          src={result.previewUrl}
                          alt={result.source}
                          onLoad={(event) => handleGlobalIconLoad(result, event.currentTarget)}
                          onError={() => rejectGlobalIcon(result)}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {globalState.status === 'empty' ? <p className="icon-results-text">Найдено подходящих результатов: 0</p> : null}
              {globalState.status === 'error' ? <p className="icon-results-text">Не удалось выполнить поиск</p> : null}
            </div>
          </section>
        ) : null}

        {activeTab === 'custom' ? (
          <section className="icon-settings-custom">
            <label className="icon-custom-upload" htmlFor={fileId}>
              <input
                id={fileId}
                className="icon-picker-input"
                type="file"
                accept="image/*"
                onChange={handleCustomIconChange}
              />
              {selectedFilePreview ? (
                <img className="icon-custom-preview" src={selectedFilePreview} alt="" />
              ) : (
                <span className="icon-custom-placeholder">
                  <ImageSquare size={28} weight="fill" />
                </span>
              )}
            </label>
          </section>
        ) : null}

        <div className="modal-actions icon-settings-actions">
          <button className="modal-button modal-button-secondary" type="button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="modal-button modal-button-primary"
            type="button"
            disabled={!hasSelection || isSubmitting}
            onClick={() => {
              void handleSave()
            }}
          >
            Сохранить
          </button>
        </div>
      </motion.section>
    </motion.div>
  )
}
