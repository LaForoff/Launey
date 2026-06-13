import { type ChangeEvent, type FormEvent, useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import type { SpaceBackground } from '../../types/space'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'
import './ChangeBackgroundModal.css'

interface ChangeBackgroundModalProps {
  isOpen: boolean
  initialValue?: SpaceBackground
  onClose: () => void
  onSave: (payload: { background: SpaceBackground; applyToAllSpaces: boolean }) => void
  onNotify: (type: 'success' | 'error', text: string) => void
  notifyOnSuccess?: boolean
  showApplyToAllToggle?: boolean
}

export function ChangeBackgroundModal({
  isOpen,
  initialValue,
  onClose,
  onSave,
  onNotify,
  notifyOnSuccess = true,
  showApplyToAllToggle = false,
}: ChangeBackgroundModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <AnimatePresence>
      {isOpen ? (
        <ModalPortal>
          <ChangeBackgroundModalForm
            key={initialValue?.type === 'default' ? 'default' : initialValue?.value}
            initialValue={initialValue}
            onClose={onClose}
            onSave={onSave}
            onNotify={onNotify}
            shouldReduceMotion={shouldReduceMotion}
            notifyOnSuccess={notifyOnSuccess}
            showApplyToAllToggle={showApplyToAllToggle}
          />
        </ModalPortal>
      ) : null}
    </AnimatePresence>
  )
}

interface ChangeBackgroundModalFormProps {
  initialValue?: SpaceBackground
  onClose: () => void
  onSave: (payload: { background: SpaceBackground; applyToAllSpaces: boolean }) => void
  onNotify: (type: 'success' | 'error', text: string) => void
  shouldReduceMotion: boolean
  notifyOnSuccess: boolean
  showApplyToAllToggle: boolean
}

function ChangeBackgroundModalForm({
  initialValue,
  onClose,
  onSave,
  onNotify,
  shouldReduceMotion,
  notifyOnSuccess,
  showApplyToAllToggle,
}: ChangeBackgroundModalFormProps) {
  const titleId = useId()
  const fileId = useId()
  const [url, setUrl] = useState(getInitialUrl(initialValue))
  const [localBackground, setLocalBackground] = useState<SpaceBackground | null>(null)
  const [fileName, setFileName] = useState('')
  const [hasError, setHasError] = useState(false)
  const [applyToAllSpaces, setApplyToAllSpaces] = useState(false)
  const canSave = url.trim().length > 0 || Boolean(localBackground)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSave) {
      return
    }

    if (localBackground) {
      onSave({ background: localBackground, applyToAllSpaces })
      if (notifyOnSuccess) {
        onNotify('success', 'Фон обновлён')
      }
      return
    }

    const nextBackground = getBackgroundFromUrl(url.trim())
    const validation = await validateRemoteBackground(nextBackground)

    if (!validation.ok) {
      setHasError(true)
      onNotify('error', validation.message)
      return
    }

    onSave({ background: nextBackground, applyToAllSpaces })
    if (notifyOnSuccess) {
      onNotify('success', 'Фон обновлён')
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setHasError(false)

    if (file.size > MAX_LOCAL_BACKGROUND_SIZE) {
      setFileName('')
      setLocalBackground(null)
      onNotify('error', 'Файл слишком большой. Максимальный размер 500 МБ.')
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      const value = typeof reader.result === 'string' ? reader.result : ''

      if (!value) {
        return
      }

      setFileName(file.name)
      setUrl('')
      setLocalBackground({
        type: file.type.startsWith('video/') ? 'local-video' : 'local-image',
        value,
        fileName: file.name,
      })
    })

    reader.readAsDataURL(file)
  }

  function handleUrlChange(value: string) {
    setUrl(value)
    setLocalBackground(null)
    setFileName('')
    setHasError(false)
  }

  return (
    <motion.div
      className="modal-backdrop change-background-backdrop"
      role="presentation"
      {...getModalBackdropAnimation(shouldReduceMotion)}
      transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
    >
      <motion.form
        className="add-url-modal change-background-modal"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        {...getCenteredModalAnimation(shouldReduceMotion)}
        transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
      >
        <div className="modal-header">
          <h2 id={titleId}>Изменить фон</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="change-background-content">
          <input
            className={
              hasError
                ? 'modal-input change-background-input modal-input-error'
                : 'modal-input change-background-input'
            }
            value={url}
            onChange={(event) => handleUrlChange(event.target.value)}
            placeholder="URL изображения / видео"
            inputMode="url"
            autoComplete="off"
          />
          <label className="background-file-button" htmlFor={fileId}>
            <input
              id={fileId}
              className="background-file-input"
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              onChange={handleFileChange}
            />
            {fileName || 'Выбрать на компьютере'}
          </label>
          {showApplyToAllToggle ? (
            <button
              className="frame-toggle-row change-background-toggle"
              type="button"
              aria-pressed={applyToAllSpaces}
              onClick={() => setApplyToAllSpaces((currentValue) => !currentValue)}
            >
              <span>Установить на всех пространствах</span>
              <span className="frame-switch" aria-hidden="true">
                <span className="frame-switch-knob" />
              </span>
            </button>
          ) : null}
        </div>

        <div className="modal-actions change-background-actions">
          <button className="modal-button modal-button-secondary" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="modal-button modal-button-primary" type="submit" disabled={!canSave}>
            Сохранить
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}

const MAX_LOCAL_BACKGROUND_SIZE = 500 * 1024 * 1024

function getInitialUrl(background?: SpaceBackground) {
  if (!background || background.type === 'default' || background.type.startsWith('local')) {
    return ''
  }

  return background.value
}

function getBackgroundFromUrl(value: string): SpaceBackground {
  const normalizedValue = normalizeBackgroundUrl(value)
  const cleanValue = normalizedValue.split(/[?#]/)[0].toLowerCase()

  if (/\.(mp4|webm|mov)$/.test(cleanValue)) {
    return { type: 'video-url', value: normalizedValue }
  }

  return { type: 'image-url', value: normalizedValue }
}

async function validateRemoteBackground(background: SpaceBackground) {
  if (background.type === 'default') {
    return {
      ok: false,
      message: 'Не удалось загрузить изображение',
    }
  }

  if (isYouTubeUrl(background.value)) {
    return {
      ok: false,
      message:
        'Ссылка YouTube не поддерживается. Используйте прямую ссылку на видеофайл .mp4, .webm или .mov.',
    }
  }

  if (background.type === 'video-url') {
    const isLoaded = await preloadVideo(background.value)

    return {
      ok: isLoaded,
      message: isLoaded ? '' : 'Не удалось загрузить видео',
    }
  }

  const isLoaded = await preloadImage(background.value)

  return {
    ok: isLoaded,
    message: isLoaded ? '' : 'Не удалось загрузить изображение',
  }
}

function preloadImage(src: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image()

    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = src
  })
}

function preloadVideo(src: string) {
  return new Promise<boolean>((resolve) => {
    const video = document.createElement('video')

    video.muted = true
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve(true)
    video.oncanplay = () => resolve(true)
    video.onerror = () => resolve(false)
    video.src = src
  })
}

function isYouTubeUrl(value: string) {
  try {
    const url = new URL(normalizeBackgroundUrl(value))

    return url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')
  } catch {
    return false
  }
}

function normalizeBackgroundUrl(value: string) {
  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value
  }

  return `https://${value}`
}
