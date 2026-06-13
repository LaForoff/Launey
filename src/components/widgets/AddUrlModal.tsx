import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link, X } from '@phosphor-icons/react'
import { cacheRemoteIcon, isCachedIconPath, isStoredIconPath } from '../../lib/iconApi'
import type { IconCustomization } from '../../types/space'
import { normalizeIconCustomization } from '../../lib/iconCustomization'
import { CustomizableIcon } from '../ui/CustomizableIcon'
import { IconSettingsModal } from './IconSettingsModal'
import { LauneyLabsModal } from './LauneyLabsModal'
import { ModalPortal } from './ModalPortal'
import {
  MODAL_DURATION,
  MODAL_EASE,
  getCenteredModalAnimation,
  getModalBackdropAnimation,
} from './modalMotion'
import './AddUrlModal.css'

export interface AddUrlPayload {
  title: string
  url: string
  icon?: string
  iconFile?: File
  iconSource?: 'appstore' | 'site' | 'generated' | 'custom'
  iconCustomization?: IconCustomization
  addFrame: boolean
}

interface AddUrlModalProps {
  isOpen: boolean
  mode?: 'add' | 'edit'
  initialValue?: AddUrlPayload
  onClose: () => void
  onSave: (payload: AddUrlPayload) => void | Promise<void>
}

export function AddUrlModal({
  isOpen,
  mode = 'add',
  initialValue,
  onClose,
  onSave,
}: AddUrlModalProps) {
  const shouldReduceMotion = Boolean(useReducedMotion())

  return (
    <AnimatePresence>
      {isOpen ? (
        <ModalPortal>
          <AddUrlModalForm
            key={`${mode}-${initialValue?.url ?? 'empty'}`}
            mode={mode}
            initialValue={initialValue}
            onClose={onClose}
            onSave={onSave}
            shouldReduceMotion={shouldReduceMotion}
          />
        </ModalPortal>
      ) : null}
    </AnimatePresence>
  )
}

interface AddUrlModalFormProps {
  mode: 'add' | 'edit'
  initialValue?: AddUrlPayload
  onClose: () => void
  onSave: (payload: AddUrlPayload) => void | Promise<void>
  shouldReduceMotion: boolean
}

type IconStatus = 'idle' | 'loading' | 'ready' | 'error'

function AddUrlModalForm({
  mode,
  initialValue,
  onClose,
  onSave,
  shouldReduceMotion,
}: AddUrlModalFormProps) {
  const titleId = useId()
  const [title, setTitle] = useState(initialValue?.title ?? '')
  const [url, setUrl] = useState(initialValue?.url ?? '')
  const [icon, setIcon] = useState<string | undefined>(initialValue?.icon)
  const [iconFile, setIconFile] = useState<File | undefined>()
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(getInitialPreviewSrc(initialValue?.icon))
  const [iconCustomization, setIconCustomization] = useState<IconCustomization | undefined>(() =>
    initialValue?.iconCustomization ? normalizeIconCustomization(initialValue.iconCustomization) : undefined,
  )
  const [addFrame, setAddFrame] = useState(initialValue?.addFrame ?? false)
  const [isSaving, setIsSaving] = useState(false)
  const [isIconSettingsOpen, setIsIconSettingsOpen] = useState(false)
  const [isLauneyLabsOpen, setIsLauneyLabsOpen] = useState(false)
  const [iconSource, setIconSource] = useState<AddUrlPayload['iconSource']>()
  const [iconStatus, setIconStatus] = useState<IconStatus>(initialValue?.icon ? 'ready' : 'idle')
  const iconResolveJobIdRef = useRef(0)

  const canSave = title.trim().length > 0 && url.trim().length > 0 && !isSaving && iconStatus !== 'loading'
  const isIconPickerDisabled = title.trim().length === 0

  useEffect(() => {
    return () => {
      if (previewSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(previewSrc)
      }
    }
  }, [previewSrc])

  useEffect(() => {
    if (!isOpenSourceIcon(initialValue?.icon)) {
      setIconStatus(initialValue?.icon ? 'ready' : 'idle')
      return
    }

    setIconStatus('loading')
  }, [initialValue?.icon])

  function resetForm() {
    setTitle('')
    setUrl('')
    setIcon(undefined)
    setIconFile(undefined)
    if (previewSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(previewSrc)
    }
    setPreviewSrc(undefined)
    setIsIconSettingsOpen(false)
    setIsLauneyLabsOpen(false)
    setIconCustomization(undefined)
    setAddFrame(false)
    setIconStatus('idle')
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSave) {
      return
    }

    try {
      setIsSaving(true)
      await onSave({
        title: title.trim(),
        url: url.trim(),
        icon,
        iconFile,
        iconSource,
        iconCustomization,
        addFrame,
      })
      resetForm()
    } catch {
      // Ошибка уже показана в родительском компоненте.
    } finally {
      setIsSaving(false)
    }
  }

  async function handleIconSettingsSave(nextValue: {
    iconUrl?: string
    iconFile?: File
    previewSrc?: string
    iconSource?: AddUrlPayload['iconSource']
  }) {
    setIsIconSettingsOpen(false)

    if (previewSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(previewSrc)
    }

    if (nextValue.iconFile) {
      const nextPreviewSrc = URL.createObjectURL(nextValue.iconFile)
      setIcon(nextValue.iconUrl)
      setIconFile(nextValue.iconFile)
      setPreviewSrc(nextPreviewSrc)
      setIconSource(nextValue.iconSource)
      setIconCustomization(undefined)
      setIconStatus('ready')
      return
    }

    if (!nextValue.iconUrl) {
      setIcon(undefined)
      setIconFile(undefined)
      setPreviewSrc(undefined)
      setIconSource(nextValue.iconSource)
      setIconCustomization(undefined)
      setIconStatus('idle')
      return
    }

    const optimisticPreview = nextValue.previewSrc ?? nextValue.iconUrl
    iconResolveJobIdRef.current += 1
    const nextJobId = iconResolveJobIdRef.current

    // Show selected icon immediately so the user sees feedback on first click.
    setIcon(nextValue.iconUrl)
    setIconFile(undefined)
    setPreviewSrc(optimisticPreview)
    setIconSource(nextValue.iconSource)
    setIconCustomization(undefined)
    setIconStatus('ready')

    try {
      const localIcon = await ensureLocalReadyIcon(nextValue.iconUrl)
      if (iconResolveJobIdRef.current !== nextJobId) {
        return
      }

      setIcon(localIcon)
      setPreviewSrc(localIcon)
      setIconStatus('ready')
    } catch {
      if (iconResolveJobIdRef.current !== nextJobId) {
        return
      }

      // Keep optimistic preview instead of dropping icon selection.
      setIconStatus('ready')
    }
  }

  return (
    <>
      <motion.div
        className="modal-backdrop"
        role="presentation"
        {...getModalBackdropAnimation(shouldReduceMotion)}
        transition={{ duration: shouldReduceMotion ? 0.18 : 0.26, ease: MODAL_EASE }}
      >
        <motion.form
          className="add-url-modal"
          aria-labelledby={titleId}
          onSubmit={handleSubmit}
          {...getCenteredModalAnimation(shouldReduceMotion)}
          transition={{ duration: shouldReduceMotion ? 0.18 : MODAL_DURATION, ease: MODAL_EASE }}
        >
        <div className="modal-header">
          <h2 id={titleId}>{mode === 'edit' ? 'Изменить URL' : 'Добавить URL'}</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={handleClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="modal-content">
          <div className="icon-picker-column">
            <button
              className={`${isIconPickerDisabled ? 'icon-picker is-disabled' : 'icon-picker'}${iconStatus === 'loading' ? ' is-loading' : ''}${previewSrc ? ' has-image' : ''}`}
              type="button"
              disabled={isIconPickerDisabled || iconStatus === 'loading'}
              onClick={() => setIsIconSettingsOpen(true)}
            >
              {iconStatus === 'loading' ? (
                <span className="icon-picker-loading" aria-hidden="true" />
              ) : previewSrc ? (
                <CustomizableIcon
                  className="icon-picker-custom-preview"
                  src={previewSrc}
                  customization={iconCustomization}
                  alt=""
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <span className="icon-picker-placeholder">
                  <Link size={26} weight="bold" />
                </span>
              )}
            </button>
            {previewSrc ? (
              <button className="icon-enhance-button" type="button" onClick={() => setIsLauneyLabsOpen(true)}>
                Улучшить
              </button>
            ) : null}
          </div>

          <div className="modal-fields">
            <input
              className="modal-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Название"
              autoComplete="off"
            />
            <input
              className="modal-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="URL"
              inputMode="url"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-button modal-button-secondary" type="button" onClick={handleClose}>
            Отмена
          </button>
          <button className="modal-button modal-button-primary" type="submit" disabled={!canSave}>
            Сохранить
          </button>
        </div>
        </motion.form>
      </motion.div>
      <IconSettingsModal
        isOpen={isIconSettingsOpen}
        title={title}
        url={url}
        initialIcon={icon}
        onClose={() => setIsIconSettingsOpen(false)}
        onSave={handleIconSettingsSave}
      />
      <LauneyLabsModal
        isOpen={isLauneyLabsOpen}
        iconSrc={previewSrc}
        title={title}
        initialValue={iconCustomization}
        onClose={() => setIsLauneyLabsOpen(false)}
        onSave={(nextCustomization) => {
          setIconCustomization(nextCustomization)
          setAddFrame(true)
          setIsLauneyLabsOpen(false)
        }}
      />
    </>
  )
}

function isOpenSourceIcon(icon: string | undefined) {
  return typeof icon === 'string' && /^https?:\/\//i.test(icon)
}

async function ensureLocalReadyIcon(iconUrl: string) {
  const localIcon = isCachedIconPath(iconUrl) ? iconUrl : await cacheRemoteIcon(iconUrl)
  await preloadLocalIcon(localIcon)
  return localIcon
}

async function preloadLocalIcon(path: string) {
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('ICON_PRELOAD_FAILED'))
    image.src = path

    if (typeof image.decode === 'function') {
      image.decode().then(resolve).catch(() => {
        // fallback to onload/onerror handlers
      })
    }
  })
}

function getInitialPreviewSrc(icon: string | undefined) {
  if (!icon?.trim()) {
    return undefined
  }

  if (isStoredIconPath(icon) || /^https?:\/\//i.test(icon) || icon.startsWith('data:image/')) {
    return icon
  }

  return undefined
}
