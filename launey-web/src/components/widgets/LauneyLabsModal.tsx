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
import { Switch } from '../ui/Switch'
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
type LauneyLabsColorFormat = 'hex' | 'rgb' | 'hsb'

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
  const [colorFormat, setColorFormat] = useState<LauneyLabsColorFormat>('hex')
  const [colorInput, setColorInput] = useState(() => normalizeIconCustomization(initialValue).backgroundColor)
  const [palettePoint, setPalettePoint] = useState(() =>
    hexToPalettePoint(normalizeIconCustomization(initialValue).backgroundColor),
  )
  const [activeTab, setActiveTab] = useState<LauneyLabsTab>('background')

  useEffect(() => {
    const normalized = normalizeIconCustomization(initialValue)
    setDraft(normalized)
    setColorInput(formatColorValue(normalized.backgroundColor, colorFormat))
    setPalettePoint(hexToPalettePoint(normalized.backgroundColor))
    setActiveTab('background')
  }, [initialValue, isOpen])

  function updateBackgroundColor(nextColor: string, syncPalette = true, syncInput = true) {
    const normalizedColor = normalizeHexColor(nextColor)

    if (!normalizedColor) {
      return
    }

    setDraft((current) => ({
      ...current,
      backgroundColor: normalizedColor,
    }))
    if (syncInput) {
      setColorInput(formatColorValue(normalizedColor, colorFormat))
    }
    if (syncPalette) {
      setPalettePoint(hexToPalettePoint(normalizedColor))
    }
  }

  function updateColorInput(nextValue: string) {
    setColorInput(nextValue)
    const normalizedColor = parseColorValue(nextValue, colorFormat)

    if (!normalizedColor) {
      return
    }

    updateBackgroundColor(normalizedColor)
  }

  function updateColorFormat(nextFormat: LauneyLabsColorFormat) {
    setColorFormat(nextFormat)
    setColorInput(formatColorValue(draft.backgroundColor, nextFormat))
  }

  function updatePaletteFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const nextX = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const nextY = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const nextColor = palettePointToHex(nextX, nextY)

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
            className="modal-backdrop"
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

              <div className="launey-labs-layout">
                <section className="launey-labs-preview-card">
                <div className="launey-labs-preview-content">
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
                </div>

                <div className="modal-actions launey-labs-actions">
                  <button className="modal-button modal-button-primary" type="button" onClick={handleSave}>
                    Сохранить
                  </button>
                </div>
                </section>

                <div className="launey-labs-settings-column">
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

                  <section className="launey-labs-settings-card">

                {activeTab === 'background' ? (
                  <div className="launey-labs-tab-panel">
                    <div className="launey-labs-control-row launey-labs-panel-heading">
                      <span>Активировать подложку</span>
                      <Switch
                        checked={draft.hasBackground}
                        ariaLabel="Активировать подложку"
                        onChange={(hasBackground) =>
                          setDraft((current) => ({
                            ...current,
                            hasBackground,
                          }))
                        }
                      />
                    </div>

                    <div
                      className={
                        draft.hasBackground
                          ? 'launey-labs-color-label'
                          : 'launey-labs-color-label is-disabled'
                      }
                    >
                      <span>Цвет подложки</span>
                      <button
                        ref={paletteRef}
                        className={
                          draft.hasBackground
                            ? 'launey-labs-color-palette'
                            : 'launey-labs-color-palette is-disabled'
                        }
                        type="button"
                        aria-label="Выбрать цвет подложки"
                        disabled={!draft.hasBackground}
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
                    <label
                      className={
                        draft.hasBackground
                          ? 'launey-labs-hex-label'
                          : 'launey-labs-hex-label is-disabled'
                      }
                    >
                      <span>Цвет</span>
                      <span className="launey-labs-color-format" role="group" aria-label="Формат цвета">
                        <button
                          type="button"
                          aria-pressed={colorFormat === 'hex'}
                          disabled={!draft.hasBackground}
                          onClick={() => updateColorFormat('hex')}
                        >
                          HEX
                        </button>
                        <button
                          type="button"
                          aria-pressed={colorFormat === 'rgb'}
                          disabled={!draft.hasBackground}
                          onClick={() => updateColorFormat('rgb')}
                        >
                          RGB
                        </button>
                        <button
                          type="button"
                          aria-pressed={colorFormat === 'hsb'}
                          disabled={!draft.hasBackground}
                          onClick={() => updateColorFormat('hsb')}
                        >
                          HSB
                        </button>
                      </span>
                      <input
                        className={
                          draft.hasBackground
                            ? 'modal-input launey-labs-hex-input'
                            : 'modal-input launey-labs-hex-input is-disabled'
                        }
                        value={colorInput}
                        onChange={(event) => updateColorInput(event.target.value)}
                        placeholder={formatColorValue(DEFAULT_ICON_CUSTOMIZATION.backgroundColor, colorFormat)}
                        disabled={!draft.hasBackground}
                        spellCheck={false}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="launey-labs-tab-panel">
                    <div className="launey-labs-setting-group">
                      <span className="launey-labs-setting-label">Прозрачность затемнения</span>
                      <div className="launey-labs-slider-stepper-row">
                        <label className="launey-labs-slider launey-labs-volume-slider">
                          <LauneyLabsSlider
                            ariaLabel="Прозрачность затемнения"
                            min={0}
                            max={100}
                            value={draft.volumeAlpha}
                            onChange={(nextValue) => updatePercentSetting('volumeAlpha', nextValue)}
                          />
                        </label>
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
                    </div>

                    <div className="launey-labs-setting-group">
                      <span className="launey-labs-setting-label">Расположение затемнения</span>
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

                    <div className="launey-labs-setting-group">
                      <span className="launey-labs-setting-label">Яркость обводки</span>
                      <div className="launey-labs-slider-stepper-row">
                        <label className="launey-labs-slider launey-labs-volume-slider">
                          <LauneyLabsSlider
                            ariaLabel="Яркость обводки"
                            min={0}
                            max={100}
                            value={draft.edgeAlpha}
                            onChange={(nextValue) => updatePercentSetting('edgeAlpha', nextValue)}
                          />
                        </label>
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
                    </div>

                    <div className="launey-labs-setting-group">
                      <span className="launey-labs-setting-label">Толщина обводки</span>
                      <div className="launey-labs-slider-stepper-row">
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
                    </div>
                  </div>
                )}
                  </section>
                </div>
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
    y: clamp((100 - rgbToHsb(rgb.r, rgb.g, rgb.b).b) / 44, 0, 1),
  }
}

function palettePointToHex(x: number, y: number) {
  const base = getPaletteBaseRgb(x)
  const overlayAlpha = 0.28 + (0.26 - 0.28) * y
  const overlayChannel = Math.round(255 * (1 - y))

  return rgbToHex({
    r: compositeChannel(base.r, overlayChannel, overlayAlpha),
    g: compositeChannel(base.g, overlayChannel, overlayAlpha),
    b: compositeChannel(base.b, overlayChannel, overlayAlpha),
  })
}

function getPaletteBaseRgb(x: number) {
  const stops = [
    { position: 0, color: { r: 255, g: 0, b: 61 } },
    { position: 0.14, color: { r: 255, g: 0, b: 212 } },
    { position: 0.28, color: { r: 75, g: 0, b: 255 } },
    { position: 0.42, color: { r: 0, g: 200, b: 255 } },
    { position: 0.56, color: { r: 0, g: 255, b: 130 } },
    { position: 0.72, color: { r: 216, g: 255, b: 0 } },
    { position: 0.86, color: { r: 255, g: 159, b: 0 } },
    { position: 1, color: { r: 255, g: 31, b: 0 } },
  ]
  const nextStopIndex = stops.findIndex((stop) => x <= stop.position)

  if (nextStopIndex <= 0) {
    return stops[0].color
  }

  const previousStop = stops[nextStopIndex - 1]
  const nextStop = stops[nextStopIndex]
  const progress = (x - previousStop.position) / (nextStop.position - previousStop.position)

  return {
    r: lerpChannel(previousStop.color.r, nextStop.color.r, progress),
    g: lerpChannel(previousStop.color.g, nextStop.color.g, progress),
    b: lerpChannel(previousStop.color.b, nextStop.color.b, progress),
  }
}

function compositeChannel(base: number, overlay: number, alpha: number) {
  return Math.round(overlay * alpha + base * (1 - alpha))
}

function lerpChannel(from: number, to: number, progress: number) {
  return Math.round(from + (to - from) * progress)
}

function parseColorValue(value: string, format: LauneyLabsColorFormat) {
  if (format === 'hex') {
    return normalizeHexColor(value)
  }

  const channels = value.match(/\d+(?:\.\d+)?/g)?.map(Number)

  if (!channels || channels.length < 3) {
    return null
  }

  if (format === 'rgb') {
    return rgbToHex({
      r: clamp(Math.round(channels[0]), 0, 255),
      g: clamp(Math.round(channels[1]), 0, 255),
      b: clamp(Math.round(channels[2]), 0, 255),
    })
  }

  return hsbToHex(channels[0], channels[1], channels[2])
}

function formatColorValue(hex: string, format: LauneyLabsColorFormat) {
  const rgb = hexToRgb(hex)

  if (!rgb) {
    return hex
  }

  if (format === 'hex') {
    return hex.replace('#', '')
  }

  if (format === 'rgb') {
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`
  }

  const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b)
  return `${Math.round(hsb.h)}, ${Math.round(hsb.s)}%, ${Math.round(hsb.b)}%`
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

function rgbToHex(rgb: { r: number; g: number; b: number }) {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

function rgbToHsb(r: number, g: number, b: number) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const hue =
    delta === 0
      ? 0
      : max === red
        ? 60 * (((green - blue) / delta) % 6)
        : max === green
          ? 60 * ((blue - red) / delta + 2)
          : 60 * ((red - green) / delta + 4)

  return {
    h: hue < 0 ? hue + 360 : hue,
    s: max === 0 ? 0 : (delta / max) * 100,
    b: max * 100,
  }
}

function hsbToHex(hue: number, saturation: number, brightness: number) {
  const normalizedHue = ((hue % 360) + 360) % 360
  const normalizedSaturation = clamp(saturation, 0, 100) / 100
  const normalizedBrightness = clamp(brightness, 0, 100) / 100
  const chroma = normalizedBrightness * normalizedSaturation
  const x = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1))
  const match = normalizedBrightness - chroma
  const [red, green, blue] =
    normalizedHue < 60
      ? [chroma, x, 0]
      : normalizedHue < 120
        ? [x, chroma, 0]
        : normalizedHue < 180
          ? [0, chroma, x]
          : normalizedHue < 240
            ? [0, x, chroma]
            : normalizedHue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return rgbToHex({
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
  })
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
