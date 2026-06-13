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
    <AnimatePresence>
      {isOpen ? (
        <ModalPortal>
          <IconSettingsModalContent
            key={title || 'icon-settings'}
            title={title}
            url={url}
            initialIcon={initialIcon}
            onClose={onClose}
            onSave={onSave}
            shouldReduceMotion={shouldReduceMotion}
          />
        </ModalPortal>
      ) : null}
    </AnimatePresence>
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
  const globalQueryRef = useRef<string>('')
  const [selectedIconUrl, setSelectedIconUrl] = useState<string | undefined>(
    initialIcon && /^https?:\/\//i.test(initialIcon) ? initialIcon : undefined,
  )
  const [selectedIconFile, setSelectedIconFile] = useState<File | undefined>()
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const requestIdRef = useRef(0)

  const selectedCountryState = searchStateByCountry[country]
  const hasSelection = Boolean(selectedIconUrl || selectedIconFile)
  const trimmedTitle = title.trim()
  const trimmedUrl = url.trim()

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
    if (activeTab !== 'appstore' || trimmedTitle.length < 2) {
      return
    }

    if (
      selectedCountryState.status === 'loading' ||
      selectedCountryState.status === 'success' ||
      selectedCountryState.status === 'empty'
    ) {
      return
    }

    requestIdRef.current += 1
    const requestId = requestIdRef.current

    setSearchStateByCountry((current) => ({
      ...current,
      [country]: {
        ...current[country],
        status: 'loading',
      },
    }))

    void fetch(`/api/app-store-icon?query=${encodeURIComponent(trimmedTitle)}&country=${country}`)
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
        if (requestId !== requestIdRef.current) {
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
  }, [activeTab, country, selectedCountryState.status, trimmedTitle])

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
        <p className="icon-settings-name">{trimmedTitle || '—'}</p>

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
                  <p className="icon-results-text">Найдено подходящих результатов: {globalState.results.length}</p>
                  <div className="icon-results-grid">
                    {globalState.results.map((result) => (
                      <button
                        type="button"
                        key={result.id}
                        className={
                          selectedIconUrl === result.previewUrl
                            ? 'icon-result-button is-selected'
                            : 'icon-result-button'
                        }
                        onClick={() => {
                          setSelectedIconUrl(result.previewUrl)
                          setSelectedIconFile(undefined)
                          setSelectedFilePreview(undefined)
                        }}
                        title={result.source}
                      >
                        <img src={result.previewUrl} alt={result.source} />
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
