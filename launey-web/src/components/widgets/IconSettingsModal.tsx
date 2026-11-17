import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ImageSquare, MagnifyingGlass, MagicWand, X } from '@phosphor-icons/react'
import { ModalPortal } from './ModalPortal'
import { StableIconImage } from '../ui/StableIconImage'
import { getBrandSearchTarget, LOGO_PROVIDER_NAMES, type BrandIcon, type LogoProvider } from '../../lib/brandIcons'
import { useBrandIconSearch } from '../../lib/useBrandIconSearch'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'
import './IconSettingsModal.css'

type IconSettingsTab = 'brands' | 'appstore' | 'custom'
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

function brandIconLabel(result: BrandIcon) {
  const source = result.provider === 'svg-logos' ? 'SVG Logos' : result.provider === 'simple-icons' ? 'Simple Icons' : LOGO_PROVIDER_NAMES[result.provider as LogoProvider]
  const variant = result.shape === 'wordmark' ? 'Логотип' : 'Значок'
  return `${result.name} · ${variant} · ${source}${result.domain ? ` · ${result.domain}` : ''}`
}

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
  const [activeTab, setActiveTab] = useState<IconSettingsTab>('brands')
  const [searchTitle, setSearchTitle] = useState(title)
  const [isBrandQueryEdited, setIsBrandQueryEdited] = useState(false)
  const context = useMemo(() => getBrandSearchTarget(url, title, searchTitle, isBrandQueryEdited), [url, title, searchTitle, isBrandQueryEdited])
  const brandQueries = context.searchQueries
  const brandState = useBrandIconSearch(activeTab === 'brands', context.domain, brandQueries)
  const [rejectedBrandIds, setRejectedBrandIds] = useState<Set<string>>(() => new Set())
  const [validatedBrandPaths, setValidatedBrandPaths] = useState<Set<string>>(() => new Set())
  const [selectedIconSource, setSelectedIconSource] = useState<IconSettingsResult['iconSource']>('site')
  const [selectedBrand, setSelectedBrand] = useState<BrandIcon>()
  const [country, setCountry] = useState<AppStoreCountry>('us')
  const [searchStateByCountry, setSearchStateByCountry] = useState<
    Record<AppStoreCountry, { status: 'idle' | 'loading' | 'success' | 'empty' | 'error'; results: AppStoreIconResult[] }>
  >({
    us: { status: 'idle', results: [] },
    ru: { status: 'idle', results: [] },
  })
  const [selectedIconUrl, setSelectedIconUrl] = useState<string | undefined>(
    initialIcon && (/^https?:\/\//i.test(initialIcon) || initialIcon.startsWith('/icon-cache/')) ? initialIcon : undefined,
  )
  const [selectedIconFile, setSelectedIconFile] = useState<File | undefined>()
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const requestIdRef = useRef(0)

  const trimmedTitle = searchTitle.trim()
  const selectedCountryState =
    trimmedTitle.length >= 2 ? searchStateByCountry[country] : { status: 'idle' as const, results: [] }
  const hasSelection = Boolean(selectedIconUrl || selectedIconFile)
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
    setSelectedIconSource('custom')
    setSelectedBrand(undefined)
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
      try {
        await onSave({ iconUrl: selectedIconUrl, previewSrc: selectedIconUrl, iconSource: selectedIconSource })
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
          <span>Название продукта или сервиса:</span>
        </p>
        <input
          className="modal-input icon-settings-name-input"
          value={searchTitle}
          onChange={(event) => {
            setSearchTitle(event.target.value)
            setIsBrandQueryEdited(true)
          }}
          placeholder="Название"
          aria-label="Название для поиска иконки"
          autoComplete="off"
        />

        <div className="icon-settings-tabs" role="tablist" aria-label="Выбор источника иконки">
          <button
            type="button"
            className={activeTab === 'brands' ? 'icon-settings-tab is-active' : 'icon-settings-tab'}
            onClick={() => setActiveTab('brands')}
          >
            <MagnifyingGlass size={12} weight="bold" aria-hidden="true" />
            <span>Логотипы</span>
          </button>
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
        </div>

        {activeTab === 'brands' ? (
          <section className="icon-settings-brands" aria-label="Иконки сайтов и продуктов" aria-busy={brandState.loading}>
            <div className="icon-settings-results" aria-live="polite">
              {brandState.loading ? <p className="icon-results-text">Ищем логотипы…</p> : null}
              <div className="icon-results-grid">
                {brandState.results.filter((result) => !rejectedBrandIds.has(result.id)).map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    className={`icon-result-button brand-result${selectedBrand?.id === result.id ? ' is-selected' : ''}`}
                    aria-label={brandIconLabel(result)}
                    disabled={!validatedBrandPaths.has(result.localIcon)}
                    aria-pressed={selectedBrand?.id === result.id}
                    onClick={() => {
                      setSelectedIconUrl(result.localIcon)
                      setSelectedIconSource('site')
                      setSelectedBrand(result)
                      setSelectedIconFile(undefined)
                      setSelectedFilePreview(undefined)
                    }}
                    title={brandIconLabel(result)}
                  >
                    <StableIconImage
                      className="brand-result-preview"
                      adaptToTheme
                      src={result.localIcon}
                      alt=""
                      onLoad={(event) => {
                        if (event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0) {
                          setValidatedBrandPaths((current) => new Set([...current, result.localIcon]))
                        }
                      }}
                      onError={() => {
                        setRejectedBrandIds((current) => new Set([...current, result.id]))
                        if (selectedBrand?.id === result.id) { setSelectedIconUrl(undefined); setSelectedBrand(undefined) }
                      }}
                    />
                  </button>
                ))}
              </div>
              {!brandState.loading && brandState.results.filter((result) => !rejectedBrandIds.has(result.id)).length === 0 ? (
                <p className="icon-results-text">{brandQueries.length || context.domain ? 'Логотипы не найдены. Уточните название или загрузите свою иконку.' : 'Введите хотя бы два символа для поиска.'}</p>
              ) : null}
            </div>
          </section>
        ) : null}

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
                          setSelectedIconSource('appstore')
                          setSelectedBrand(undefined)
                          setSelectedIconFile(undefined)
                          setSelectedFilePreview(undefined)
                        }}
                      >
                        <StableIconImage className="icon-result-preview" src={result.iconUrl} alt={result.title} adaptToTheme />
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
                <StableIconImage className="icon-custom-preview" src={selectedFilePreview} alt="" adaptToTheme />
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
