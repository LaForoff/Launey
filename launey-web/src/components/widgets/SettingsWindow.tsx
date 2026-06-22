import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowClockwise,
  ArrowsClockwise,
  CloudSun,
  DownloadSimple,
  Info,
  PaintBrushBroad,
  UploadSimple,
  X,
} from '@phosphor-icons/react'
import logo from '../../assets/logo.png'
import logoLauney from '../../assets/logo-launey.png'
import themeDark from '../../assets/theme-dark.jpg'
import themeLight from '../../assets/theme-light.jpg'
import themeSystem from '../../assets/theme-system.jpg'
import { APP_VERSION, BUILD_INFO } from '../../config/buildInfo'
import { DottedLogo } from '../ui/DottedLogo'
import { ReleaseNotesMarkdown } from '../ui/ReleaseNotesMarkdown'
import type { AppearanceTheme, AppSettings, SyncMeta } from '../../lib/settingsApi'
import { formatDateTime } from '../../lib/formatBuildDate'
import type { LauneyExportFile } from '../../lib/launeySync'
import {
  CURRENT_RELEASE,
  compareVersions,
  downloadUpdateAsset,
  getCurrentReleaseDetails,
  getStoredCurrentReleaseDetails,
  getStoredUpdateCheck,
  githubUpdateProvider,
  storeUpdateCheck,
  type UpdateRelease,
} from '../../lib/updateService'
import { searchWeatherCities, type WeatherCitySuggestion } from '../../lib/weatherApi'
import type { SpaceBackground } from '../../types/space'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import { UpdateCard, type UpdateCardVisualState } from './UpdateCard'
import { UpdateReleaseModalSurface } from './UpdateAvailableModal'
import './SettingsWindow.css'

export type SettingsSection = 'sync' | 'appearance' | 'weather' | 'about' | 'updates'

interface SettingsSliderProps {
  ariaLabel: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  onInteractionStart?: () => void
  onInteractionEnd?: () => void
}

interface SettingsWindowProps {
  isOpen: boolean
  draftSettings: AppSettings
  requestedSection?: SettingsSection | null
  onClose: () => void
  onDraftSettingsChange: (updater: (current: AppSettings) => AppSettings) => void
  onOpenBackgroundPicker: () => void
  onNotify: (type: 'warning' | 'error', text: string) => void
  onNotifySuccess: (text: string) => void
  onExport: () => Promise<void>
  onImport: (file: LauneyExportFile) => Promise<void>
}

const SIDEBAR_ITEMS: Array<{
  id: SettingsSection
  label: string
  icon: (props: { size?: number; className?: string }) => ReactElement
}> = [
  { id: 'sync', label: 'Синхронизация', icon: (props) => <ArrowsClockwise {...props} weight="fill" /> },
  { id: 'appearance', label: 'Оформление', icon: (props) => <PaintBrushBroad {...props} weight="fill" /> },
  { id: 'weather', label: 'Погода', icon: (props) => <CloudSun {...props} weight="fill" /> },
  { id: 'about', label: 'О приложении', icon: (props) => <Info {...props} weight="fill" /> },
  { id: 'updates', label: 'Обновления', icon: (props) => <ArrowClockwise {...props} weight="fill" /> },
]

export function SettingsWindow({
  isOpen,
  draftSettings,
  requestedSection = null,
  onClose,
  onDraftSettingsChange,
  onOpenBackgroundPicker,
  onNotify,
  onNotifySuccess,
  onExport,
  onImport,
}: SettingsWindowProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen ? (
          <SettingsWindowContent
            draftSettings={draftSettings}
            requestedSection={requestedSection}
            onClose={onClose}
            onDraftSettingsChange={onDraftSettingsChange}
            onOpenBackgroundPicker={onOpenBackgroundPicker}
            onNotify={onNotify}
            onNotifySuccess={onNotifySuccess}
            onExport={onExport}
            onImport={onImport}
            shouldReduceMotion={shouldReduceMotion}
          />
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}

interface SettingsWindowContentProps extends Omit<SettingsWindowProps, 'isOpen'> {
  shouldReduceMotion: boolean
}

function SettingsWindowContent({
  draftSettings,
  requestedSection,
  onClose,
  onDraftSettingsChange,
  onOpenBackgroundPicker,
  onNotify,
  onNotifySuccess,
  onExport,
  onImport,
  shouldReduceMotion,
}: SettingsWindowContentProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('sync')
  const [shouldAnimateAboutLogo, setShouldAnimateAboutLogo] = useState(false)
  const [isPreviewingWallpaper, setIsPreviewingWallpaper] = useState(false)
  const [releaseNotesRelease, setReleaseNotesRelease] = useState<UpdateRelease | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (releaseNotesRelease) {
          setReleaseNotesRelease(null)
          return
        }

        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, releaseNotesRelease])

  useEffect(() => {
    if (!isPreviewingWallpaper) {
      return
    }

    function stopPreview() {
      setIsPreviewingWallpaper(false)
    }

    window.addEventListener('pointerup', stopPreview, true)
    window.addEventListener('pointercancel', stopPreview, true)

    return () => {
      window.removeEventListener('pointerup', stopPreview, true)
      window.removeEventListener('pointercancel', stopPreview, true)
    }
  }, [isPreviewingWallpaper])

  useEffect(() => {
    if (requestedSection) {
      setActiveSection(requestedSection)
      setShouldAnimateAboutLogo(requestedSection === 'about')
    }
  }, [requestedSection])

  const backgroundLabel = useMemo(() => getBackgroundLabel(draftSettings.background), [draftSettings.background])

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  function handleSectionChange(section: SettingsSection) {
    setShouldAnimateAboutLogo(section === 'about' && activeSection !== 'about')

    setActiveSection(section)
  }

  return (
    <motion.div
      className={isPreviewingWallpaper ? 'modal-backdrop settings-window-backdrop is-previewing' : 'modal-backdrop settings-window-backdrop'}
      role="presentation"
      {...getModalBackdropAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.14 : 0.24, ease: MODAL_EASE }}
      onPointerDown={handleBackdropPointerDown}
    >
      <motion.section
        className={isPreviewingWallpaper ? 'settings-window is-previewing' : 'settings-window'}
        aria-label="Настройки"
        {...getCenteredModalAnimation(shouldReduceMotion)}
        transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
      >
        <aside className="settings-sidebar">
          <div className="settings-sidebar-title">Настройки</div>
          <nav className="settings-sidebar-nav" aria-label="Разделы настроек">
            {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={activeSection === id ? 'settings-sidebar-item is-active' : 'settings-sidebar-item'}
                onClick={() => handleSectionChange(id)}
              >
                <span className="settings-sidebar-icon">
                  <Icon size={15} />
                </span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="settings-content">
          <button type="button" className="settings-window-close" aria-label="Закрыть настройки" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>

          {activeSection === 'sync' ? (
            <SyncSection
              syncMeta={draftSettings.syncMeta}
              onNotify={onNotify}
              onNotifySuccess={onNotifySuccess}
              onExport={onExport}
              onImport={onImport}
            />
          ) : null}

          {activeSection === 'appearance' ? (
            <AppearanceSection
              settings={draftSettings}
              backgroundLabel={backgroundLabel}
              onChangeSettings={onDraftSettingsChange}
              onOpenBackgroundPicker={onOpenBackgroundPicker}
              onPreviewStart={() => setIsPreviewingWallpaper(true)}
              onPreviewEnd={() => setIsPreviewingWallpaper(false)}
            />
          ) : null}

          {activeSection === 'weather' ? (
            <WeatherSection
              weatherLocation={draftSettings.weatherLocation}
              onChange={(value) =>
                onDraftSettingsChange((current) => ({ ...current, weatherLocation: value }))
              }
            />
          ) : null}

          {activeSection === 'about' ? (
            <AboutSection animateLogo={shouldAnimateAboutLogo} />
          ) : null}
          {activeSection === 'updates' ? (
            <UpdatesSection
              settings={draftSettings}
              onChangeSettings={onDraftSettingsChange}
              onShowReleaseNotes={setReleaseNotesRelease}
              onNotify={onNotify}
              onNotifySuccess={onNotifySuccess}
            />
          ) : null}
        </div>
      </motion.section>
      <AnimatePresence>
        {releaseNotesRelease ? (
          <ReleaseNotesModal
            release={releaseNotesRelease}
            onClose={() => setReleaseNotesRelease(null)}
            onNotify={onNotify}
            onNotifySuccess={onNotifySuccess}
            shouldReduceMotion={shouldReduceMotion}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

interface SyncSectionProps {
  syncMeta: SyncMeta
  onNotify: (type: 'warning' | 'error', text: string) => void
  onNotifySuccess: (text: string) => void
  onExport: () => Promise<void>
  onImport: (file: LauneyExportFile) => Promise<void>
}

function SyncSection({ syncMeta, onNotify, onNotifySuccess, onExport, onImport }: SyncSectionProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [pendingFile, setPendingFile] = useState<LauneyExportFile | null>(null)

  async function handleExport() {
    if (isExporting || isImporting) {
      return
    }

    try {
      setIsExporting(true)
      await onExport()
      onNotifySuccess('Экспорт Launey готов')
    } catch {
      onNotify('error', 'Не удалось выполнить экспорт')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleImportFile(file: File) {
    try {
      const rawText = await file.text()
      const parsed = JSON.parse(rawText) as LauneyExportFile
      if (!parsed || parsed.app !== 'Launey' || !Array.isArray(parsed.spaces)) {
        throw new Error('invalid-file')
      }
      setPendingFile(parsed)
    } catch {
      onNotify('error', 'Файл импорта повреждён')
    }
  }

  async function confirmImport() {
    if (!pendingFile) {
      return
    }

    try {
      setIsImporting(true)
      await onImport(pendingFile)
      setPendingFile(null)
      onNotifySuccess('Импорт завершён. Обновляем Launey...')
      window.setTimeout(() => {
        window.location.reload()
      }, 400)
    } catch {
      onNotify('error', 'Не удалось выполнить импорт')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      <div className="settings-section">
        <header className="settings-section-header">
          <h2>Синхронизация</h2>
        </header>

        <div className="settings-info-card">
          <Info size={14} weight="fill" />
          <p>
            Сохраняйте и переносите свои пространства, папки и URL между устройствами без необходимости
            настраивать всё заново.
          </p>
        </div>

        <div className="settings-stack">
          <article className="settings-card settings-card-split">
            <div className="settings-card-copy">
              <h3>Экспорт</h3>
              <p>
                Сохраните все пространства, папки, URL и настройки в единый файл, чтобы быстро
                перенести или восстановить своё рабочее пространство Launey в любой момент.
              </p>
              <span className="settings-card-meta">Последний экспорт: {formatDateTime(syncMeta.lastExportAt)}</span>
            </div>
            <button type="button" className="settings-inline-button" onClick={handleExport} disabled={isExporting || isImporting}>
              <DownloadSimple size={15} weight="fill" />
              <span>{isExporting ? 'Экспорт…' : 'Экспорт'}</span>
            </button>
          </article>

          <article className="settings-card settings-card-split">
            <div className="settings-card-copy">
              <h3>Импорт</h3>
              <p>
                Импортируйте ранее сохранённый файл, чтобы мгновенно восстановить структуру пространств,
                папок и URL на другом устройстве или после переустановки браузера.
              </p>
              <span className="settings-card-meta">Последний импорт: {formatDateTime(syncMeta.lastImportAt)}</span>
            </div>
            <label className="settings-inline-button settings-inline-file-button">
              <UploadSimple size={15} weight="fill" />
              <span>{isImporting ? 'Импорт…' : 'Импорт'}</span>
              <input
                type="file"
                accept=".launeyexport,application/json"
                disabled={isExporting || isImporting}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void handleImportFile(file)
                  }
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </article>
        </div>
      </div>
      <AnimatePresence>
        {pendingFile ? (
        <motion.div
          className="modal-backdrop modal-backdrop-strong"
          role="presentation"
          {...getModalBackdropAnimation(shouldReduceMotion)}
          transition={{ duration: shouldReduceMotion ? 0.14 : 0.24, ease: MODAL_EASE }}
        >
          <motion.section
            className="add-url-modal delete-url-modal"
            {...getCenteredModalAnimation(shouldReduceMotion)}
            transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
          >
            <div className="modal-header">
              <h2>Импортировать данные?</h2>
            </div>
            <p>
              Импорт заменит текущие пространства и настройки. Продолжить?
            </p>
            <div className="delete-url-actions">
              <button className="modal-button modal-button-secondary" type="button" onClick={() => setPendingFile(null)} disabled={isImporting}>
                Отмена
              </button>
              <button className="modal-button modal-button-danger" type="button" onClick={() => void confirmImport()} disabled={isImporting}>
                Импортировать
              </button>
            </div>
          </motion.section>
        </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

interface AppearanceSectionProps {
  settings: AppSettings
  backgroundLabel: string
  onChangeSettings: (updater: (current: AppSettings) => AppSettings) => void
  onOpenBackgroundPicker: () => void
  onPreviewStart: () => void
  onPreviewEnd: () => void
}

const THEME_OPTIONS: Array<{
  value: AppearanceTheme
  label: string
  image: string
}> = [
  { value: 'system', label: 'Системное', image: themeSystem },
  { value: 'light', label: 'Светлое', image: themeLight },
  { value: 'dark', label: 'Тёмное', image: themeDark },
]

function AppearanceSection({
  settings,
  backgroundLabel,
  onChangeSettings,
  onOpenBackgroundPicker,
  onPreviewStart,
  onPreviewEnd,
}: AppearanceSectionProps) {
  return (
    <div className="settings-section settings-section-appearance">
      <header className="settings-section-header">
        <h2>Оформление</h2>
      </header>

      <div className="settings-info-card">
        <Info size={14} weight="fill" />
        <p>
          Создайте собственный стиль Launey, настраивая обои, прозрачность, эффекты и внешний вид
          элементов интерфейса.
        </p>
      </div>

      <article className="settings-card settings-theme-card">
        <h3>Оформление</h3>
        <div className="settings-theme-options" role="radiogroup" aria-label="Тема интерфейса">
          {THEME_OPTIONS.map((option) => {
            const isSelected = settings.appearanceTheme === option.value

            return (
              <button
                key={option.value}
                type="button"
                className={isSelected ? 'settings-theme-option is-selected' : 'settings-theme-option'}
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  onChangeSettings((current) => ({ ...current, appearanceTheme: option.value }))
                }}
              >
                <img src={option.image} alt="" />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      </article>

      <article className="settings-card settings-wallpaper-card">
        <div className="settings-background-row">
          <div className="settings-background-copy">
            <span className="settings-field-label">Используемый фон</span>
            <strong>{backgroundLabel}</strong>
          </div>
          <button type="button" className="settings-inline-button" onClick={onOpenBackgroundPicker}>
            Изменить фон
          </button>
        </div>

        <div className="settings-slider-row">
          <span className="settings-slider-label">Размытие фона</span>
          <span className="settings-slider-value">{settings.backgroundBlur}%</span>
          <SettingsSlider
            ariaLabel="Размытие фона"
            min={0}
            max={100}
            value={settings.backgroundBlur}
            onInteractionStart={onPreviewStart}
            onInteractionEnd={onPreviewEnd}
            onChange={(nextValue) => {
              onChangeSettings((current) => ({ ...current, backgroundBlur: nextValue }))
            }}
          />
        </div>

        <div className="settings-slider-row">
          <span className="settings-slider-label">Затемнение фона</span>
          <span className="settings-slider-value">{settings.backgroundDim}%</span>
          <SettingsSlider
            ariaLabel="Затемнение фона"
            min={0}
            max={100}
            value={settings.backgroundDim}
            onInteractionStart={onPreviewStart}
            onInteractionEnd={onPreviewEnd}
            onChange={(nextValue) => {
              onChangeSettings((current) => ({ ...current, backgroundDim: nextValue }))
            }}
          />
        </div>
      </article>
    </div>
  )
}

function SettingsSlider({
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  onChange,
  onInteractionStart,
  onInteractionEnd,
}: SettingsSliderProps) {
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const progress = clamp((value - min) / (max - min), 0, 1)

  function getValueFromPointer(clientX: number) {
    const rect = sliderRef.current?.getBoundingClientRect()

    if (!rect) {
      return value
    }

    const nextProgress = clamp((clientX - rect.left) / rect.width, 0, 1)
    return snapSliderValue(min + nextProgress * (max - min), min, max, step)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    onInteractionStart?.()
    onChange(getValueFromPointer(event.clientX))
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    onChange(getValueFromPointer(event.clientX))
  }

  function handleInteractionEnd() {
    onInteractionEnd?.()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step : step

    if (event.key === 'Home') {
      event.preventDefault()
      onChange(min)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      onChange(max)
      return
    }

    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
      return
    }

    event.preventDefault()
    onChange(snapSliderValue(value + delta, min, max, step))
  }

  return (
    <div
      ref={sliderRef}
      className="settings-slider"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{ '--settings-slider-fill': `${progress * 100}%` } as CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleInteractionEnd}
      onPointerCancel={handleInteractionEnd}
      onLostPointerCapture={handleInteractionEnd}
      onKeyDown={handleKeyDown}
    >
      <span className="settings-slider-fill" aria-hidden="true">
        <span className="settings-slider-thumb" />
      </span>
    </div>
  )
}

interface WeatherSectionProps {
  weatherLocation: string
  onChange: (value: string) => void
}

function WeatherSection({ weatherLocation, onChange }: WeatherSectionProps) {
  const [suggestions, setSuggestions] = useState<WeatherCitySuggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const query = weatherLocation.trim()

    if (searchTimeoutRef.current !== null) {
      window.clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }

    if (query.length < 2) {
      setSuggestions([])
      setIsLoadingSuggestions(false)
      setIsSuggestionsOpen(false)
      return
    }

    const controller = new AbortController()
    setIsLoadingSuggestions(true)

    searchTimeoutRef.current = window.setTimeout(() => {
      void searchWeatherCities(query, controller.signal)
        .then((nextSuggestions) => {
          setSuggestions(nextSuggestions)
          setIsSuggestionsOpen(nextSuggestions.length > 0)
        })
        .catch(() => {
          setSuggestions([])
          setIsSuggestionsOpen(false)
        })
        .finally(() => {
          setIsLoadingSuggestions(false)
        })
    }, 220)

    return () => {
      controller.abort()
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
    }
  }, [weatherLocation])

  function handleLocationKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    setIsSuggestionsOpen(false)
    event.currentTarget.blur()
  }

  return (
    <div className="settings-section settings-section-weather">
      <header className="settings-section-header">
        <h2>Погода</h2>
      </header>

      <div className="settings-info-card">
        <Info size={14} weight="fill" />
        <p>Следите за актуальной погодой и температурой прямо на стартовом экране Launey.</p>
      </div>

      <article className="settings-card">
        <label className="settings-input-block" htmlFor="settings-weather-location">
          <span className="settings-field-label">Город</span>
          <div className="settings-city-field">
            <input
              id="settings-weather-location"
              className="settings-text-input"
              type="text"
              value={weatherLocation}
              placeholder="Например: Москва"
              onChange={(event) => onChange(event.target.value)}
              onFocus={() => setIsSuggestionsOpen(suggestions.length > 0)}
              onBlur={() => {
                window.setTimeout(() => setIsSuggestionsOpen(false), 120)
              }}
              onKeyDown={handleLocationKeyDown}
              autoComplete="off"
            />
            {isSuggestionsOpen ? (
              <div className="settings-city-suggestions" role="listbox" aria-label="Варианты города">
                {suggestions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="settings-city-suggestion"
                    onClick={() => {
                      onChange(entry.label)
                      setIsSuggestionsOpen(false)
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            ) : null}
            {isLoadingSuggestions ? <span className="settings-city-loading">Поиск...</span> : null}
          </div>
        </label>
      </article>

    </div>
  )
}

function AboutSection({ animateLogo }: { animateLogo: boolean }) {
  return (
    <div className="settings-section settings-section-about">
      <header className="settings-section-header">
        <h2>О приложении</h2>
      </header>

      <div className="settings-about-center">
        <DottedLogo
          className="settings-about-dotted-logo"
          animate={animateLogo}
          staggerMs={125}
          revealDurationMs={420}
        />
        <h3>{BUILD_INFO.appName}</h3>
        <p className="settings-about-version">ver: {APP_VERSION}</p>
        <p className="settings-about-description">
          Персональная стартовая страница в стиле Apple Launchpad, превращающая обычные
          закладки в удобное и визуально цельное рабочее пространство с плавными анимациями и
          глубокой кастомизацией.
        </p>
      </div>

      <div className="settings-about-footer">
        <a
          href="https://designby4roff.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть сайт designby4roff"
        >
          <img src={logo} alt="designby4roff" />
        </a>
      </div>
    </div>
  )
}

interface UpdatesSectionProps {
  settings: AppSettings
  onChangeSettings: (updater: (current: AppSettings) => AppSettings) => void
  onShowReleaseNotes: (release: UpdateRelease) => void
  onNotify: (type: 'warning' | 'error', text: string) => void
  onNotifySuccess: (text: string) => void
}

function UpdatesSection({
  settings,
  onChangeSettings,
  onShowReleaseNotes,
  onNotify,
  onNotifySuccess,
}: UpdatesSectionProps) {
  const storedUpdateCheck = useMemo(() => getStoredUpdateCheck(), [])
  const storedCurrentRelease = useMemo(() => getStoredCurrentReleaseDetails(), [])
  const [cardState, setCardState] = useState<UpdateCardVisualState>(() =>
    getUpdateCardState(APP_VERSION, storedUpdateCheck?.release),
  )
  const [release, setRelease] = useState<UpdateRelease>(storedUpdateCheck?.release ?? CURRENT_RELEASE)
  const [currentRelease, setCurrentRelease] = useState<UpdateRelease>(storedCurrentRelease ?? CURRENT_RELEASE)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(storedUpdateCheck?.checkedAt ?? null)
  const [isChecking, setIsChecking] = useState(false)
  const currentVersion = APP_VERSION

  useEffect(() => {
    let isCancelled = false

    void getCurrentReleaseDetails()
      .then((resolvedCurrentRelease) => {
        if (!isCancelled) {
          setCurrentRelease(resolvedCurrentRelease)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCurrentRelease(CURRENT_RELEASE)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  async function handleCheck() {
    if (isChecking) {
      return
    }

    setIsChecking(true)

    try {
      const nextRelease = await githubUpdateProvider.checkForUpdates()
      const nextCheckedAt = formatUpdateCheckDate(new Date())
      const nextCardState = getUpdateCardState(currentVersion, nextRelease)

      setRelease(nextRelease)
      setLastCheckedAt(nextCheckedAt)
      setCardState(nextCardState)

      if (nextCardState === 'latest') {
        onNotifySuccess('Установлена актуальная версия Launey')
      }

      storeUpdateCheck({
        checkedAt: nextCheckedAt,
        release: nextRelease,
      })
    } catch (error) {
      console.error('[updates] check failed', error)
      onNotify('error', 'Не удалось проверить наличие обновлений')
    } finally {
      setIsChecking(false)
    }
  }

  function handleInstall() {
    if (!release.downloadUrl) {
      return
    }

    try {
      downloadUpdateAsset(release)
      onNotifySuccess('Началось скачивание обновления')
    } catch (error) {
      console.error('[updates] download failed', error)
      onNotify('error', 'Не удалось скачать обновление')
    }
  }

  return (
    <div className="settings-section settings-section-updates">
      <header className="settings-section-header">
        <h2>Обновления</h2>
      </header>

      <div className="settings-info-card">
        <Info size={14} weight="fill" />
        <p>
          Узнавайте о новых версиях, просматривайте список изменений и поддерживайте приложение в
          актуальном состоянии.
        </p>
      </div>

      <div className="settings-updates-stack">
        <UpdateCard
          state={cardState}
          release={release}
          lastCheckedAt={lastCheckedAt}
          checkOnOpen={settings.checkUpdatesOnOpen}
          isChecking={isChecking}
          onCheck={() => void handleCheck()}
          onInstall={handleInstall}
          onShowChanges={() => onShowReleaseNotes(release)}
          onToggleCheckOnOpen={() =>
            onChangeSettings((current) => ({
              ...current,
              checkUpdatesOnOpen: !current.checkUpdatesOnOpen,
            }))
          }
        />

        <CurrentVersionCard release={currentRelease} />
      </div>
    </div>
  )
}

function CurrentVersionCard({ release }: { release: UpdateRelease }) {
  return (
    <article className="settings-card settings-current-version-card">
      <div className="settings-current-version-heading">
        <img src={logoLauney} alt="" />
        <div>
          <span>Текущая версия</span>
          <strong>Launey {release.version}</strong>
        </div>
      </div>

      <div className="settings-release-notes">
        <h3>Об этом обновлении</h3>
        <ReleaseNotesMarkdown
          className="settings-release-notes-content"
          markdown={release.releaseNotesMarkdown}
        />
      </div>
    </article>
  )
}

function ReleaseNotesModal({
  release,
  onClose,
  onNotify,
  onNotifySuccess,
  shouldReduceMotion,
}: {
  release: UpdateRelease
  onClose: () => void
  onNotify: (type: 'warning' | 'error', text: string) => void
  onNotifySuccess: (text: string) => void
  shouldReduceMotion: boolean
}) {
  function handleInstall() {
    if (!release.downloadUrl) {
      return
    }

    try {
      downloadUpdateAsset(release)
      onNotifySuccess('Началось скачивание обновления')
      onClose()
    } catch (error) {
      console.error('[updates] download failed', error)
      onNotify('error', 'Не удалось скачать обновление')
    }
  }

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <motion.div
      className="modal-backdrop modal-backdrop-strong"
      role="presentation"
      {...getModalBackdropAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.14 : 0.24, ease: MODAL_EASE }}
      onPointerDown={handleBackdropPointerDown}
    >
      <UpdateReleaseModalSurface
        release={release}
        onClose={onClose}
        actions={{
          secondaryLabel: 'Установить позже',
          onSecondary: onClose,
          primaryLabel: 'Установить сейчас',
          onPrimary: handleInstall,
          primaryDisabled: !release.downloadUrl,
        }}
      />
    </motion.div>
  )
}

function formatUpdateCheckDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getUpdateCardState(currentVersion: string, release?: UpdateRelease | null): UpdateCardVisualState {
  if (!release) {
    return 'idle'
  }

  const compareResult = compareVersions(currentVersion, release.version)

  if (compareResult < 0) {
    return 'available'
  }

  if (compareResult === 0) {
    return 'latest'
  }

  return 'idle'
}

function getBackgroundLabel(background: SpaceBackground) {
  if (background.type === 'default') {
    return 'Системный фон'
  }

  if (background.type === 'local-image' || background.type === 'local-video') {
    return getReadableLocalBackgroundName(background) || 'name....file'
  }

  return getReadableFileName(background.value) || background.value
}

function getReadableLocalBackgroundName(background: Extract<SpaceBackground, { type: 'local-image' | 'local-video' }>) {
  if (background.fileName && background.fileName.trim()) {
    return getReadableFileName(background.fileName.trim())
  }

  if (!background.value.startsWith('data:')) {
    return getReadableFileName(background.value)
  }

  const match = background.value.match(/^data:([^;,]+)[;,]/i)
  const mimeType = match?.[1]?.toLowerCase() ?? ''
  const extension = mimeTypeToExtension(mimeType)

  return `name....${extension}`
}

function getReadableFileName(value: string) {
  if (!value) {
    return ''
  }

  let fileName = ''

  try {
    const parsedUrl = new URL(value)
    fileName = decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() ?? '')
  } catch {
    fileName = value
  }

  if (!fileName) {
    return ''
  }

  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return fileName.length > 24 ? `${fileName.slice(0, 24)}...` : fileName
  }

  const ext = fileName.slice(dotIndex + 1)
  const base = fileName.slice(0, dotIndex)
  const shortBase = base.length > 12 ? `${base.slice(0, 12)}...` : base

  return `${shortBase}.${ext}`
}

function mimeTypeToExtension(mimeType: string) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return 'jpg'
  }

  if (mimeType === 'image/png') {
    return 'png'
  }

  if (mimeType === 'image/webp') {
    return 'webp'
  }

  if (mimeType === 'image/gif') {
    return 'gif'
  }

  if (mimeType === 'image/svg+xml') {
    return 'svg'
  }

  if (mimeType === 'video/mp4') {
    return 'mp4'
  }

  if (mimeType === 'video/webm') {
    return 'webm'
  }

  if (mimeType === 'video/quicktime') {
    return 'mov'
  }

  return 'file'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snapSliderValue(value: number, min: number, max: number, step: number) {
  const decimals = getStepDecimals(step)
  const steppedValue = min + Math.round((value - min) / step) * step
  return Number(clamp(steppedValue, min, max).toFixed(decimals))
}

function getStepDecimals(step: number) {
  const decimalPart = step.toString().split('.')[1]
  return decimalPart?.length ?? 0
}
