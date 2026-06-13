import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import type { IconCustomization } from '../../types/space'
import { DEFAULT_ICON_CUSTOMIZATION, normalizeHexColor, normalizeIconCustomization } from '../../lib/iconCustomization'
import { CustomizableIcon } from '../ui/CustomizableIcon'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'
import './SettingsWindow.css'
import './LauneyLabsModal.css'

type LauneyLabsTab = 'background' | 'volume'

interface LauneyLabsSliderProps {
  ariaLabel: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

interface LauneyLabsModalProps {
  isOpen: boolean
  iconSrc: string | undefined
  title: string
  initialValue?: IconCustomization
  onClose: () => void
  onSave: (value: IconCustomization) => void
}

export function LauneyLabsModal({
  isOpen,
  iconSrc,
  title,
  initialValue,
  onClose,
  onSave,
}: LauneyLabsModalProps) {
  const titleId = useId()
  const shouldReduceMotion = Boolean(useReducedMotion())
  const paletteRef = useRef<HTMLButtonElement | null>(null)
  const [draft, setDraft] = useState(() => normalizeIconCustomization(initialValue))
  const [hexInput, setHexInput] = useState(() => normalizeIconCustomization(initialValue).backgroundColor)
  const [palettePoint, setPalettePoint] = useState(() =>
    hexToPalettePoint(normalizeIconCustomization(initialValue).backgroundColor),
  )
  const [activeTab, setActiveTab] = useState<LauneyLabsTab>('background')

  useEffect(() => {
    const normalized = normalizeIconCustomization(initialValue)
    setDraft(normalized)
    setHexInput(normalized.backgroundColor)
    setPalettePoint(hexToPalettePoint(normalized.backgroundColor))
    setActiveTab('background')
  }, [initialValue, isOpen])

  function updateBackgroundColor(nextColor: string, syncPalette = true) {
    setHexInput(nextColor)
    const normalizedColor = normalizeHexColor(nextColor)

    if (!normalizedColor) {
      return
    }

    setDraft((current) => ({
      ...current,
      backgroundColor: normalizedColor,
    }))
    setHexInput(normalizedColor)
    if (syncPalette) {
      setPalettePoint(hexToPalettePoint(normalizedColor))
    }
  }

  function updatePaletteFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const nextX = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const nextY = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const nextColor = hslToHex(nextX * 360, 100, 50 - nextY * 26)

    setPalettePoint({ x: nextX, y: nextY })
    updateBackgroundColor(nextColor, false)
  }

  function handlePalettePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePaletteFromPointer(event)
  }

  function handlePalettePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    updatePaletteFromPointer(event)
  }

  function handleSave() {
    onSave(normalizeIconCustomization(draft))
  }

  function updatePercentSetting(key: 'volumeAlpha' | 'edgeAlpha', value: number) {
    setDraft((current) => ({
      ...current,
      [key]: clamp(value, 0, 100),
    }))
  }

  function updateEdgeThickness(value: number) {
    setDraft((current) => ({
      ...current,
      edgeThickness: clampDecimal(value, 0, 3, 1),
    }))
  }

  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen && iconSrc ? (
          <motion.div
            className="modal-backdrop modal-backdrop-strong"
            role="presentation"
            {...getModalBackdropAnimation(shouldReduceMotion)}
            transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
          >
            <motion.section
              className="add-url-modal launey-labs-modal"
              aria-labelledby={titleId}
              {...getCenteredModalAnimation(shouldReduceMotion)}
              transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
            >
            <div className="modal-header launey-labs-header">
              <h2 id={titleId}>Launey Labs</h2>
              <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
                <X size={18} weight="bold" />
              </button>
            </div>

            <p className="launey-labs-description">
              Персонализируйте иконку, настроив её внешний вид под свои предпочтения.
            </p>

            <div className="launey-labs-preview-row" aria-hidden="true">
              <span className="launey-labs-ghost-column">
                <span className="launey-labs-ghost-preview" />
                <span className="launey-labs-ghost-title" />
              </span>
              <div className="launey-labs-active-preview">
                <CustomizableIcon
                  className="launey-labs-icon"
                  src={iconSrc}
                  customization={draft}
                  loading="eager"
                  decoding="sync"
                />
                <span className="launey-labs-icon-title">{title.trim() || 'Name URL'}</span>
              </div>
              <span className="launey-labs-ghost-column">
                <span className="launey-labs-ghost-preview" />
                <span className="launey-labs-ghost-title" />
              </span>
            </div>

            <div className="launey-labs-scroll-body">
              <label className="launey-labs-slider launey-labs-icon-size-slider">
                <span>Размер иконки</span>
                <LauneyLabsSlider
                  ariaLabel="Размер иконки"
                  min={50}
                  max={120}
                  value={draft.scale}
                  onChange={(nextValue) =>
                    setDraft((current) => ({
                      ...current,
                      scale: nextValue,
                    }))
                  }
                />
              </label>

              <div className="launey-labs-tabs" role="tablist" aria-label="Настройки иконки">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'background'}
                  className={activeTab === 'background' ? 'icon-settings-tab is-active' : 'icon-settings-tab'}
                  onClick={() => setActiveTab('background')}
                >
                  Подложка
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'volume'}
                  className={activeTab === 'volume' ? 'icon-settings-tab is-active' : 'icon-settings-tab'}
                  onClick={() => setActiveTab('volume')}
                >
                  Объёмность
                </button>
              </div>

              {activeTab === 'background' ? (
                <section className="launey-labs-tab-panel">
                  <div className="launey-labs-control-row launey-labs-panel-heading">
                    <span>Активировать подложку</span>
                    <button
                      className="launey-labs-background-switch"
                      type="button"
                      aria-pressed={draft.hasBackground}
                      aria-label="Переключить подложку"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          hasBackground: !current.hasBackground,
                        }))
                      }
                    >
                      <span className="frame-switch" aria-hidden="true">
                        <span className="frame-switch-knob" />
                      </span>
                    </button>
                  </div>

                  {draft.hasBackground ? (
                    <>
                      <div className="launey-labs-color-label">
                        <span>Цвет подложки</span>
                        <button
                          ref={paletteRef}
                          className="launey-labs-color-palette"
                          type="button"
                          aria-label="Выбрать цвет подложки"
                          onPointerDown={handlePalettePointerDown}
                          onPointerMove={handlePalettePointerMove}
                        >
                          <span
                            className="launey-labs-color-thumb"
                            style={{
                              left: `${palettePoint.x * 100}%`,
                              top: `${palettePoint.y * 100}%`,
                            }}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      <label className="launey-labs-hex-label">
                        <span>Hex Color #</span>
                        <input
                          className="modal-input launey-labs-hex-input"
                          value={hexInput.replace('#', '')}
                          onChange={(event) => updateBackgroundColor(event.target.value)}
                          placeholder={DEFAULT_ICON_CUSTOMIZATION.backgroundColor.replace('#', '')}
                          spellCheck={false}
                        />
                      </label>
                    </>
                  ) : null}
                </section>
              ) : (
                <section className="launey-labs-tab-panel">
                  <div className="launey-labs-control-row">
                    <span>Прозрачность затемнения</span>
                    <div className="launey-labs-stepper" aria-label="Прозрачность затемнения">
                      <button
                        type="button"
                        onClick={() => updatePercentSetting('volumeAlpha', draft.volumeAlpha - 1)}
                        aria-label="Уменьшить прозрачность затемнения"
                      >
                        -
                      </button>
                      <span>{draft.volumeAlpha}%</span>
                      <button
                        type="button"
                        onClick={() => updatePercentSetting('volumeAlpha', draft.volumeAlpha + 1)}
                        aria-label="Увеличить прозрачность затемнения"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <label className="launey-labs-slider launey-labs-volume-slider">
                    <LauneyLabsSlider
                      ariaLabel="Прозрачность затемнения"
                      min={0}
                      max={100}
                      value={draft.volumeAlpha}
                      onChange={(nextValue) => updatePercentSetting('volumeAlpha', nextValue)}
                    />
                  </label>

                  <div className="launey-labs-control-row">
                    <span>Расположение затемнения</span>
                    <div className="launey-labs-segmented" role="group" aria-label="Расположение затемнения">
                      <button
                        type="button"
                        aria-pressed={draft.volumePlacement === 'below'}
                        onClick={() => setDraft((current) => ({ ...current, volumePlacement: 'below' }))}
                      >
                        Под картинкой
                      </button>
                      <button
                        type="button"
                        aria-pressed={draft.volumePlacement === 'above'}
                        onClick={() => setDraft((current) => ({ ...current, volumePlacement: 'above' }))}
                      >
                        Над картинкой
                      </button>
                    </div>
                  </div>

                  <div className="launey-labs-control-row">
                    <span>Яркость обводки</span>
                    <div className="launey-labs-stepper" aria-label="Яркость обводки">
                      <button
                        type="button"
                        onClick={() => updatePercentSetting('edgeAlpha', draft.edgeAlpha - 1)}
                        aria-label="Уменьшить яркость обводки"
                      >
                        -
                      </button>
                      <span>{draft.edgeAlpha}%</span>
                      <button
                        type="button"
                        onClick={() => updatePercentSetting('edgeAlpha', draft.edgeAlpha + 1)}
                        aria-label="Увеличить яркость обводки"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <label className="launey-labs-slider launey-labs-volume-slider">
                    <LauneyLabsSlider
                      ariaLabel="Яркость обводки"
                      min={0}
                      max={100}
                      value={draft.edgeAlpha}
                      onChange={(nextValue) => updatePercentSetting('edgeAlpha', nextValue)}
                    />
                  </label>

                  <div className="launey-labs-control-row">
                    <span>Толщина обводки</span>
                    <div className="launey-labs-stepper" aria-label="Толщина обводки">
                      <button
                        type="button"
                        onClick={() => updateEdgeThickness(draft.edgeThickness - 0.1)}
                        aria-label="Уменьшить толщину обводки"
                      >
                        -
                      </button>
                      <span>{draft.edgeThickness.toFixed(1)}</span>
                      <button
                        type="button"
                        onClick={() => updateEdgeThickness(draft.edgeThickness + 0.1)}
                        aria-label="Увеличить толщину обводки"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <label className="launey-labs-slider launey-labs-volume-slider">
                    <LauneyLabsSlider
                      ariaLabel="Толщина обводки"
                      min={0}
                      max={3}
                      step={0.1}
                      value={draft.edgeThickness}
                      onChange={(nextValue) => updateEdgeThickness(nextValue)}
                    />
                  </label>
                </section>
              )}
            </div>

            <div className="modal-actions launey-labs-actions">
              <button className="modal-button modal-button-secondary" type="button" onClick={onClose}>
                Отмена
              </button>
              <button className="modal-button modal-button-primary" type="button" onClick={handleSave}>
                Сохранить
              </button>
            </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ModalPortal>
  )
}

function LauneyLabsSlider({ ariaLabel, value, min, max, step = 1, onChange }: LauneyLabsSliderProps) {
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
    onChange(getValueFromPointer(event.clientX))
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    onChange(getValueFromPointer(event.clientX))
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
      className="launey-labs-slider-control"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{ '--launey-slider-fill': `${progress * 100}%` } as CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <span className="launey-labs-slider-fill" aria-hidden="true">
        <span className="launey-labs-slider-thumb" />
      </span>
    </div>
  )
}

function hexToPalettePoint(hex: string) {
  const rgb = hexToRgb(hex)

  if (!rgb) {
    return { x: 0.5, y: 0.5 }
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  return {
    x: hsl.h / 360,
    y: clamp((50 - hsl.l) / 26, 0, 1),
  }
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex)

  if (!normalized) {
    return null
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function rgbToHsl(r: number, g: number, b: number) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: lightness * 100 }
  }

  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  const hue =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4

  return {
    h: (hue / 6) * 360,
    s: saturation * 100,
    l: lightness * 100,
  }
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs((2 * lightness) / 100 - 1)) * (saturation / 100)
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = lightness / 100 - chroma / 2
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampDecimal(value: number, min: number, max: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(clamp(value, min, max) * factor) / factor
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
