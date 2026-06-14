import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Header } from '../widgets/Header'
import { SearchField } from '../widgets/SearchField'
import { ActionBar } from '../widgets/ActionBar'
import { AddUrlModal, type AddUrlPayload } from '../widgets/AddUrlModal'
import { ChangeBackgroundModal } from '../widgets/ChangeBackgroundModal'
import { DeleteFolderModal } from '../widgets/DeleteFolderModal'
import { DeleteUrlModal } from '../widgets/DeleteUrlModal'
import { DeleteSpaceModal } from '../widgets/DeleteSpaceModal'
import { FolderContextMenu } from '../widgets/FolderContextMenu'
import { CreateSpaceModal } from '../widgets/CreateSpaceModal'
import { CreateFolderModal, type FolderSelectionRef } from '../widgets/CreateFolderModal'
import { EditSpacesOrderModal } from '../widgets/EditSpacesOrderModal'
import { SpaceMenu } from '../widgets/SpaceMenu'
import { SettingsWindow } from '../widgets/SettingsWindow'
import { Toast, type ToastMessage } from '../widgets/Toast'
import { UrlContextMenu } from '../widgets/UrlContextMenu'
import { TileGrid } from '../tiles/TileGrid'
import { SpaceDots } from '../spaces/SpaceDots'
import { FolderModal } from '../folder/FolderModal'
import { GlowSwap } from '../ui/GlowSwap'
import { useSpacesStorage } from '../../hooks/useSpacesStorage'
import type { FolderTile as FolderTileType, Space, SpaceBackground, UrlTile } from '../../types/space'
import {
  cacheRemoteIcon,
  deleteIcon,
  isCachedIconPath,
  isLocalUserIconPath,
  uploadIcon,
} from '../../lib/iconApi'
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  loadAppSettingsFromLocalStorage,
  saveAppSettings,
  saveAppSettingsToLocalStorage,
  sanitizeAppSettings,
  type AppSettings,
} from '../../lib/settingsApi'
import { getTileFallbackIcon } from '../../lib/urlTile'
import { fromLauneyExportSpaces, toLauneyExportSpaces, type LauneyExportFile } from '../../lib/launeySync'
import { downloadLauneyExport, exportLauneyData, importLauneyData } from '../../lib/syncApi'
import { GearSix, PencilSimple, Plus } from '@phosphor-icons/react'
import './Shell.css'

const ADAPTIVE_WALLPAPER_ACCENT = true
const WALLPAPER_ACCENT_FALLBACK: RgbColor = { r: 90, g: 98, b: 112 }
const SLIDER_ACCENT_FALLBACK: RgbColor = { r: 150, g: 165, b: 190 }
const NEUTRAL_ACCENT_RGB = formatRgbCss(WALLPAPER_ACCENT_FALLBACK)
const NEUTRAL_SLIDER_RGB = formatRgbCss(SLIDER_ACCENT_FALLBACK)
let hasWarnedAboutAccentExtraction = false

interface ShellProps {
  spaces: Space[]
  activeSpaceIndex: number
  autoFocusSearch?: boolean
}

export function Shell({ spaces, activeSpaceIndex, autoFocusSearch = false }: ShellProps) {
  const {
    spaces: localSpaces,
    setSpaces,
    persistSpaces,
    persistActiveSpaceId,
    activeSpaceIndex: currentSpaceIndex,
    setActiveSpaceId,
  } = useSpacesStorage(spaces, activeSpaceIndex)
  const [urlModal, setUrlModal] = useState<{
    isOpen: boolean
    mode: 'add' | 'edit'
    tile?: UrlTile
    folderId?: string
  }>({ isOpen: false, mode: 'add' })
  const [spaceMenu, setSpaceMenu] = useState<{ x: number; y: number } | null>(null)
  const [urlMenu, setUrlMenu] = useState<{
    x: number
    y: number
    tile: UrlTile
    folderId?: string
  } | null>(null)
  const [folderMenu, setFolderMenu] = useState<{
    x: number
    y: number
    tile: FolderTileType
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    tile: UrlTile
    folderId?: string
  } | null>(null)
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderTileType | null>(null)
  const [folderModalState, setFolderModalState] = useState<{
    folderId: string | null
    isOpen: boolean
  }>({
    folderId: null,
    isOpen: false,
  })
  const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState(false)
  const [isDeleteSpaceModalOpen, setIsDeleteSpaceModalOpen] = useState(false)
  const [isCreateSpaceModalOpen, setIsCreateSpaceModalOpen] = useState(false)
  const [folderBuilderModal, setFolderBuilderModal] = useState<{
    isOpen: boolean
    mode: 'create' | 'edit'
    folderId: string | null
  }>({
    isOpen: false,
    mode: 'create',
    folderId: null,
  })
  const [isEditSpacesModalOpen, setIsEditSpacesModalOpen] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [dragOffsetPx, setDragOffsetPx] = useState(0)
  const [isTrackDragging, setIsTrackDragging] = useState(false)
  const [isTileDragging, setIsTileDragging] = useState(false)
  const [isGridEditMode, setIsGridEditMode] = useState(false)
  const [isSpaceTitleEditing, setIsSpaceTitleEditing] = useState(false)
  const [spaceTitleDraft, setSpaceTitleDraft] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [appSettings, setAppSettings] = useState<AppSettings>(
    () => loadAppSettingsFromLocalStorage() ?? DEFAULT_APP_SETTINGS,
  )
  const [draftAppSettings, setDraftAppSettings] = useState<AppSettings>(
    () => loadAppSettingsFromLocalStorage() ?? DEFAULT_APP_SETTINGS,
  )
  const [isReducedMotion, setIsReducedMotion] = useState(false)
  const [decodedIcons, setDecodedIcons] = useState<Set<string>>(() => new Set())
  const [highlightedFolderId, setHighlightedFolderId] = useState<string | null>(null)
  const [exitingTileIds, setExitingTileIds] = useState<Set<string>>(() => new Set())
  const settingsSaveTimeoutRef = useRef<number | null>(null)
  const createdFolderHighlightTimeoutRef = useRef<number | null>(null)
  const settingsSaveJobIdRef = useRef(0)
  const draftSettingsRef = useRef<AppSettings>(appSettings)
  const isAppSettingsLoadedRef = useRef(false)
  const spaceTitleRef = useRef<HTMLHeadingElement | null>(null)
  const spaceTitleInputRef = useRef<HTMLInputElement | null>(null)
  const actionBarWrapRef = useRef<HTMLDivElement | null>(null)
  const editModeButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousTitleWidthRef = useRef<number | null>(null)
  const previousEditButtonWidthRef = useRef<number | null>(null)
  const actionShiftRafRef = useRef<number | null>(null)
  const editButtonWidthRafRef = useRef<number | null>(null)
  const exitingTileTimeoutsRef = useRef(new Map<string, number>())
  const dragStateRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    lastX: number
    lastTime: number
    prevX: number
    prevTime: number
    isHorizontal: boolean | null
    startedOnTile: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
    prevX: 0,
    prevTime: 0,
    isHorizontal: null,
    startedOnTile: false,
  })
  const wheelSwipeRef = useRef({
    accumulatedX: 0,
    lastEventTime: 0,
    switchedInCurrentGesture: false,
  })
  const activeSpace = localSpaces[currentSpaceIndex]
  const openedFolder =
    folderModalState.folderId
      ? activeSpace.tiles.find((tile) => tile.kind === 'folder' && tile.id === folderModalState.folderId)
      : null
  const editingFolder =
    folderBuilderModal.mode === 'edit' && folderBuilderModal.folderId
      ? activeSpace.tiles.find(
          (tile): tile is FolderTileType => tile.kind === 'folder' && tile.id === folderBuilderModal.folderId,
        ) ?? null
      : null
  const previewSettings = isSettingsOpen ? draftAppSettings : appSettings
  const background = getEffectiveBackground(previewSettings.background, activeSpace.background)
  const isAnyOverlayOpen =
    isSettingsOpen ||
    urlModal.isOpen ||
    isBackgroundModalOpen ||
    isDeleteSpaceModalOpen ||
    isCreateSpaceModalOpen ||
    folderBuilderModal.isOpen ||
    isEditSpacesModalOpen ||
    Boolean(deleteTarget) ||
    Boolean(folderDeleteTarget) ||
    folderModalState.isOpen ||
    Boolean(spaceMenu) ||
    Boolean(urlMenu) ||
    Boolean(folderMenu)

  useEffect(() => {
    const root = document.documentElement
    const selectedTheme = previewSettings.appearanceTheme
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const resolvedTheme = selectedTheme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : selectedTheme
      root.dataset.appearanceTheme = selectedTheme
      root.dataset.theme = resolvedTheme
    }

    applyTheme()
    mediaQuery.addEventListener('change', applyTheme)
    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [previewSettings.appearanceTheme])

  useEffect(() => {
    const root = document.documentElement

    if (!ADAPTIVE_WALLPAPER_ACCENT) {
      root.style.setProperty('--wallpaper-accent-rgb', NEUTRAL_ACCENT_RGB)
      root.style.setProperty('--slider-accent-rgb', NEUTRAL_SLIDER_RGB)
      return
    }

    let isCancelled = false
    root.style.setProperty('--wallpaper-accent-rgb', NEUTRAL_ACCENT_RGB)
    root.style.setProperty('--slider-accent-rgb', NEUTRAL_SLIDER_RGB)

    void getAdaptiveModalColors(background).then(({ accent, sliderAccent }) => {
      if (isCancelled) {
        return
      }

      root.style.setProperty('--wallpaper-accent-rgb', formatRgbCss(accent))
      root.style.setProperty('--slider-accent-rgb', formatRgbCss(sliderAccent))
    })

    return () => {
      isCancelled = true
    }
  }, [background])

  function prepareForSpaceSwitch() {
    setSpaceMenu(null)
    setIsGridEditMode(false)
    setIsSpaceTitleEditing(false)
  }

  useEffect(() => {
    setSpaceTitleDraft(activeSpace.title)
  }, [activeSpace.id, activeSpace.title])

  useEffect(() => {
    if (!isSpaceTitleEditing) {
      return
    }

    spaceTitleInputRef.current?.focus()
    spaceTitleInputRef.current?.select()
  }, [isSpaceTitleEditing])

  useLayoutEffect(() => {
    const titleElement = spaceTitleRef.current
    const actionWrapElement = actionBarWrapRef.current

    if (!titleElement || !actionWrapElement) {
      return
    }

    const nextTitleWidth = titleElement.getBoundingClientRect().width
    const previousTitleWidth = previousTitleWidthRef.current ?? nextTitleWidth
    previousTitleWidthRef.current = nextTitleWidth

    const shiftDelta = previousTitleWidth - nextTitleWidth

    if (isReducedMotion || Math.abs(shiftDelta) < 0.5) {
      actionWrapElement.style.transition = ''
      actionWrapElement.style.transform = 'translate3d(0, 0, 0)'
      return
    }

    if (actionShiftRafRef.current !== null) {
      window.cancelAnimationFrame(actionShiftRafRef.current)
      actionShiftRafRef.current = null
    }

    actionWrapElement.style.transition = 'none'
    actionWrapElement.style.transform = `translate3d(${shiftDelta}px, 0, 0)`
    void actionWrapElement.offsetWidth

    actionShiftRafRef.current = window.requestAnimationFrame(() => {
      actionWrapElement.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)'
      actionWrapElement.style.transform = 'translate3d(0, 0, 0)'
      actionShiftRafRef.current = null
    })

    return () => {
      if (actionShiftRafRef.current !== null) {
        window.cancelAnimationFrame(actionShiftRafRef.current)
        actionShiftRafRef.current = null
      }
    }
  }, [activeSpace.id, isReducedMotion])

  useLayoutEffect(() => {
    const editButtonElement = editModeButtonRef.current

    if (!editButtonElement) {
      return
    }
    const buttonElement = editButtonElement

    const nextButtonWidth = editButtonElement.getBoundingClientRect().width
    const previousButtonWidth = previousEditButtonWidthRef.current ?? nextButtonWidth
    previousEditButtonWidthRef.current = nextButtonWidth

    if (isReducedMotion || Math.abs(nextButtonWidth - previousButtonWidth) < 0.5) {
      buttonElement.style.transition = ''
      buttonElement.style.width = ''
      return
    }

    if (editButtonWidthRafRef.current !== null) {
      window.cancelAnimationFrame(editButtonWidthRafRef.current)
      editButtonWidthRafRef.current = null
    }

    buttonElement.style.transition = 'none'
    buttonElement.style.width = `${previousButtonWidth}px`
    void buttonElement.offsetWidth

    editButtonWidthRafRef.current = window.requestAnimationFrame(() => {
      buttonElement.style.transition = 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)'
      buttonElement.style.width = `${nextButtonWidth}px`
      editButtonWidthRafRef.current = null
    })

    function handleTransitionEnd(event: TransitionEvent) {
      if (event.propertyName !== 'width') {
        return
      }

      buttonElement.style.transition = ''
      buttonElement.style.width = ''
      buttonElement.removeEventListener('transitionend', handleTransitionEnd)
    }

    buttonElement.addEventListener('transitionend', handleTransitionEnd)

    return () => {
      buttonElement.removeEventListener('transitionend', handleTransitionEnd)
      if (editButtonWidthRafRef.current !== null) {
        window.cancelAnimationFrame(editButtonWidthRafRef.current)
        editButtonWidthRafRef.current = null
      }
    }
  }, [isReducedMotion, isSpaceTitleEditing])

  function switchToSpaceByIndex(nextIndex: number) {
    if (isAnyOverlayOpen) {
      return
    }

    if (nextIndex < 0 || nextIndex >= localSpaces.length) {
      return
    }

    const nextSpaceId = localSpaces[nextIndex]?.id

    if (!nextSpaceId) {
      return
    }

    prepareForSpaceSwitch()
    closeFolderModal()
    setActiveSpaceId(nextSpaceId)
  }

  function toggleSpaceTitleEditMode() {
    if (isSpaceTitleEditing) {
      const nextTitle = spaceTitleDraft.trim()
      if (nextTitle.length > 0 && nextTitle !== activeSpace.title) {
        setSpaces((currentSpaces) =>
          currentSpaces.map((space) =>
            space.id === activeSpace.id
              ? {
                  ...space,
                  title: nextTitle,
                }
              : space,
          ),
        )
      }
      setIsGridEditMode(false)
      setIsSpaceTitleEditing(false)
      return
    }

    setSpaceTitleDraft(activeSpace.title)
    setIsGridEditMode(true)
    setIsSpaceTitleEditing(true)
  }

  function openSettingsPanel() {
    setDraftAppSettings(appSettings)
    setIsSettingsOpen(true)
  }

  function closeSettingsPanel() {
    setDraftAppSettings(appSettings)
    setIsSettingsOpen(false)
  }

  function handleDraftSettingsChange(updater: (current: AppSettings) => AppSettings) {
    const nextSettings = sanitizeAppSettings(updater(draftSettingsRef.current))

    draftSettingsRef.current = nextSettings
    setDraftAppSettings(nextSettings)
    setAppSettings(nextSettings)
    saveAppSettingsToLocalStorage(nextSettings)

    if (settingsSaveTimeoutRef.current !== null) {
      window.clearTimeout(settingsSaveTimeoutRef.current)
      settingsSaveTimeoutRef.current = null
    }

    const jobId = settingsSaveJobIdRef.current + 1
    settingsSaveJobIdRef.current = jobId

    settingsSaveTimeoutRef.current = window.setTimeout(() => {
      const settingsToSave = nextSettings

      void saveAppSettings(settingsToSave)
        .then((savedSettings) => {
          if (settingsSaveJobIdRef.current !== jobId) {
            return
          }

          const mergedSettings = mergeSettingsSyncMeta(savedSettings, settingsToSave)
          setAppSettings(mergedSettings)
          setDraftAppSettings(mergedSettings)
          saveAppSettingsToLocalStorage(mergedSettings)
        })
        .catch(() => {
          if (settingsSaveJobIdRef.current !== jobId) {
            return
          }

          showToast('warning', 'Не удалось сохранить настройки')
        })
    }, 260)
  }

  function switchSpaceByOffset(offset: -1 | 1) {
    if (isAnyOverlayOpen) {
      return
    }

    if (localSpaces.length <= 1) {
      return
    }

    const nextIndex = Math.min(localSpaces.length - 1, Math.max(0, currentSpaceIndex + offset))
    if (nextIndex === currentSpaceIndex) {
      return
    }
    switchToSpaceByIndex(nextIndex)
  }

  useEffect(() => {
    function closeMenus() {
      setSpaceMenu(null)
      setUrlMenu(null)
      setFolderMenu(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenus()
        return
      }

      const target = event.target as HTMLElement | null
      const isTypingField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if (isTypingField) {
        return
      }

      if (isSettingsOpen && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        return
      }

      if (event.key === 'ArrowLeft') {
        switchSpaceByOffset(-1)
        return
      }

      if (event.key === 'ArrowRight') {
        switchSpaceByOffset(1)
      }
    }

    document.addEventListener('click', closeMenus)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('click', closeMenus)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSettingsOpen, switchSpaceByOffset])

  useEffect(() => {
    const localSettings = loadAppSettingsFromLocalStorage()

    if (localSettings) {
      setAppSettings(localSettings)
      setDraftAppSettings(localSettings)
    }

    void (async () => {
      try {
        const loadedSettings = mergeSettingsSyncMeta(await loadAppSettings(), localSettings)
        setAppSettings(loadedSettings)
        setDraftAppSettings(loadedSettings)
        saveAppSettingsToLocalStorage(loadedSettings)
      } catch {
        const fallbackSettings = localSettings ?? DEFAULT_APP_SETTINGS
        setAppSettings(fallbackSettings)
        setDraftAppSettings(fallbackSettings)
        showToast('warning', 'Не удалось загрузить настройки')
      } finally {
        isAppSettingsLoadedRef.current = true
      }
    })()
  }, [])

  useEffect(() => {
    if (!isAppSettingsLoadedRef.current) {
      return
    }

    saveAppSettingsToLocalStorage(appSettings)
  }, [appSettings])

  useEffect(() => {
    draftSettingsRef.current = draftAppSettings
  }, [draftAppSettings])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setIsReducedMotion(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    return () => {
      exitingTileTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      exitingTileTimeoutsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => setToast(null), 5_000)

    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(
    () => () => {
      if (settingsSaveTimeoutRef.current !== null) {
        window.clearTimeout(settingsSaveTimeoutRef.current)
      }
      if (createdFolderHighlightTimeoutRef.current !== null) {
        window.clearTimeout(createdFolderHighlightTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    window.__launeyCacheRemoteIcons = async () => {
      const remoteIcons = collectRemoteIcons(localSpaces)
      let successCount = 0
      let errorCount = 0

      if (remoteIcons.length === 0) {
        console.log('[icon-cache] remote icons found: 0')
        console.log('[icon-cache] cached: 0')
        console.log('[icon-cache] errors: 0')
        return { found: 0, cached: 0, errors: 0 }
      }

      const cacheMap = new Map<string, string>()

      for (const iconUrl of remoteIcons) {
        try {
          if (!cacheMap.has(iconUrl)) {
            cacheMap.set(iconUrl, await cacheRemoteIcon(iconUrl))
          }
          successCount += 1
        } catch {
          errorCount += 1
        }
      }

      setSpaces((currentSpaces) => replaceRemoteIcons(currentSpaces, cacheMap))

      console.log(`[icon-cache] remote icons found: ${remoteIcons.length}`)
      console.log(`[icon-cache] cached: ${successCount}`)
      console.log(`[icon-cache] errors: ${errorCount}`)

      return { found: remoteIcons.length, cached: successCount, errors: errorCount }
    }

    return () => {
      delete window.__launeyCacheRemoteIcons
    }
  }, [localSpaces, setSpaces])

  useEffect(() => {
    const iconPaths = [...collectLocalIconPaths(localSpaces)]

    if (iconPaths.length === 0) {
      return
    }

    const pendingIcons = iconPaths.filter((iconPath) => !decodedIcons.has(iconPath))

    if (pendingIcons.length === 0) {
      return
    }

    let isCancelled = false

    void (async () => {
      for (const iconPath of pendingIcons) {
        if (isCancelled) {
          return
        }

        const image = new Image()
        image.src = iconPath

        try {
          if (typeof image.decode === 'function') {
            await image.decode()
          } else {
            await new Promise<void>((resolvePromise, reject) => {
              image.onload = () => resolvePromise()
              image.onerror = () => reject(new Error('image-load-failed'))
            })
          }

          if (import.meta.env.DEV) {
            console.log('[icon] preload done', iconPath)
          }

          setDecodedIcons((current) => {
            if (current.has(iconPath)) {
              return current
            }

            const next = new Set(current)
            next.add(iconPath)
            return next
          })
        } catch {
          // ignore preload failures, runtime img load can still succeed later
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [decodedIcons, localSpaces])

  async function handleSaveUrl(payload: AddUrlPayload) {
    const currentTile = urlModal.tile
    const previousIcon = currentTile?.icon
    let nextIcon = payload.icon

    try {
      if (payload.iconFile) {
        nextIcon = await uploadIcon(payload.iconFile)
      }
      if (
        !payload.iconFile &&
        (payload.iconSource === 'appstore' || payload.iconSource === 'site' || payload.iconSource === 'generated') &&
        typeof nextIcon === 'string' &&
        (/^https?:\/\//i.test(nextIcon) || nextIcon.startsWith('data:image/'))
      ) {
        nextIcon = await cacheRemoteIcon(nextIcon)
        await preloadLocalIcon(nextIcon)
      }
    } catch {
      showToast('error', 'Не удалось загрузить иконку')
      throw new Error('icon-upload-failed')
    }

    setSpaces((currentSpaces) =>
      currentSpaces.map((space, index) => {
        if (index !== currentSpaceIndex) {
          return space
        }

        const folderId = urlModal.mode === 'edit' ? urlModal.folderId : undefined

        return {
          ...space,
          tiles: getUpdatedTiles(space.tiles, payload, nextIcon, currentTile, folderId),
        }
      }),
    )

    if (payload.iconFile && isLocalUserIconPath(previousIcon) && previousIcon !== nextIcon) {
      try {
        await deleteIcon(previousIcon)
      } catch {
        showToast('warning', 'Новая иконка сохранена, но старый файл удалить не удалось')
      }
    }

    closeUrlModal()
  }

  async function handleDeleteUrl() {
    if (!deleteTarget) {
      return
    }

    const currentDeleteTarget = deleteTarget
    setDeleteTarget(null)
    startTileExit(currentDeleteTarget.tile.id, async () => {
      const iconToDelete = currentDeleteTarget.tile.icon

      setSpaces((currentSpaces) =>
        currentSpaces.map((space, index) =>
          index === currentSpaceIndex
            ? {
                ...space,
                tiles: currentDeleteTarget.folderId
                  ? space.tiles.map((tile) =>
                      tile.kind === 'folder' && tile.id === currentDeleteTarget.folderId
                        ? {
                            ...tile,
                            items: tile.items.filter((item) => item.id !== currentDeleteTarget.tile.id),
                          }
                        : tile,
                    )
                  : space.tiles.filter((tile) => tile.id !== currentDeleteTarget.tile.id),
              }
            : space,
        ),
      )

      if (!isLocalUserIconPath(iconToDelete)) {
        return
      }

      try {
        await deleteIcon(iconToDelete)
      } catch {
        showToast('warning', 'URL удалён, но файл иконки удалить не удалось')
      }
    })
  }

  function openAddUrlModal() {
    setSpaceMenu(null)
    setUrlModal({ isOpen: true, mode: 'add' })
  }

  function openEditUrlModal(tile: UrlTile) {
    setUrlMenu(null)
    setUrlModal({ isOpen: true, mode: 'edit', tile, folderId: urlMenu?.folderId })
  }

  function closeUrlModal() {
    setUrlModal({ isOpen: false, mode: 'add', folderId: undefined })
  }

  function handleOpenSpaceMenu(rect: DOMRect) {
    setUrlMenu(null)
    setFolderMenu(null)
    setSpaceMenu({ x: rect.left, y: rect.bottom + 8 })
  }

  function openFolderModal(folderId: string) {
    setFolderModalState({
      folderId,
      isOpen: true,
    })
  }

  function closeFolderModal() {
    setSpaceMenu(null)
    setUrlMenu(null)
    setFolderMenu(null)
    setFolderModalState((currentState) => ({
      ...currentState,
      isOpen: false,
    }))
  }

  function handleFolderModalExitComplete() {
    setFolderModalState((currentState) =>
      currentState.isOpen
        ? currentState
        : { folderId: null, isOpen: false },
    )
  }

  function handleUrlContextMenu(tile: UrlTile, x: number, y: number, folderId?: string) {
    setSpaceMenu(null)
    setFolderMenu(null)
    setUrlMenu({ tile, x, y, folderId })
  }

  function handleFolderContextMenu(tile: FolderTileType, x: number, y: number) {
    setSpaceMenu(null)
    setUrlMenu(null)
    setFolderMenu({ tile, x, y })
  }

  function openDeleteFolderModal() {
    if (!folderMenu) {
      return
    }

    setFolderDeleteTarget(folderMenu.tile)
    setFolderMenu(null)
  }

  function openDeleteSpaceModal() {
    setSpaceMenu(null)
    setIsDeleteSpaceModalOpen(true)
  }

  function openCreateSpaceModal() {
    setIsCreateSpaceModalOpen(true)
  }

  function openCreateFolderModal() {
    setSpaceMenu(null)
    setFolderBuilderModal({
      isOpen: true,
      mode: 'create',
      folderId: null,
    })
  }

  function openEditFolderModal() {
    const targetFolder = folderMenu?.tile ?? (openedFolder && openedFolder.kind === 'folder' ? openedFolder : null)

    if (!targetFolder) {
      return
    }

    setFolderMenu(null)
    setFolderBuilderModal({
      isOpen: true,
      mode: 'edit',
      folderId: targetFolder.id,
    })
  }

  function openEditSpacesModal() {
    setIsEditSpacesModalOpen(true)
  }

  function handleCreateSpace(title: string) {
    const nextId = `space-${Date.now()}`
    setSpaces((currentSpaces) => [
      ...currentSpaces,
      {
        id: nextId,
        title,
        tiles: [],
      },
    ])
    setIsCreateSpaceModalOpen(false)
    setActiveSpaceId(nextId)
  }

  function handleCreateFolder(payload: { title: string; selectedTiles: FolderSelectionRef[] }) {
    const selectedBySpace = new Map<string, Set<string>>()

    for (const entry of payload.selectedTiles) {
      if (entry.source !== 'space') {
        continue
      }

      const existing = selectedBySpace.get(entry.spaceId) ?? new Set<string>()
      existing.add(entry.tileId)
      selectedBySpace.set(entry.spaceId, existing)
    }

    const activeSelectedIds = selectedBySpace.get(activeSpace.id) ?? new Set<string>()
    const firstActiveSelectedIndex = activeSpace.tiles.findIndex(
      (tile) => tile.kind === 'url' && activeSelectedIds.has(tile.id),
    )
    const createdFolderId = `folder-${Date.now()}`

    const selectedItems = localSpaces.flatMap((space) =>
      space.tiles.flatMap((tile) =>
        tile.kind === 'url' && Boolean(selectedBySpace.get(space.id)?.has(tile.id))
          ? [stripRestoreOrigin(tile)]
          : [],
      ),
    )

    if (selectedItems.length === 0) {
      return
    }

    const folderTile: FolderTileType = {
      id: createdFolderId,
      kind: 'folder',
      title: payload.title.trim() || 'Новая папка',
      items: selectedItems,
      accent: selectedItems[0]?.accent ?? 'rgba(255, 255, 255, 0.24)',
      icon: selectedItems[0]?.icon ?? '',
    }

    setSpaces((currentSpaces) =>
      currentSpaces.map((space) => {
        const selectedIds = selectedBySpace.get(space.id)
        const filteredTiles = space.tiles.filter(
          (tile) => !(tile.kind === 'url' && selectedIds?.has(tile.id)),
        )

        if (space.id !== activeSpace.id) {
          return {
            ...space,
            tiles: filteredTiles,
          }
        }

        const insertIndex = firstActiveSelectedIndex >= 0 ? firstActiveSelectedIndex : filteredTiles.length
        const nextTiles = [...filteredTiles]
        nextTiles.splice(insertIndex, 0, folderTile)

        return {
          ...space,
          tiles: nextTiles,
        }
      }),
    )

    setHighlightedFolderId(createdFolderId)
    setFolderBuilderModal({
      isOpen: false,
      mode: 'create',
      folderId: null,
    })
    if (createdFolderHighlightTimeoutRef.current !== null) {
      window.clearTimeout(createdFolderHighlightTimeoutRef.current)
    }
    createdFolderHighlightTimeoutRef.current = window.setTimeout(
      () => setHighlightedFolderId((current) => (current === createdFolderId ? null : current)),
      700,
    )
  }

  function handleSaveEditedFolder(payload: { title: string; selectedTiles: FolderSelectionRef[] }) {
    if (!editingFolder) {
      return
    }

    const selectedBySpace = new Map<string, Set<string>>()
    const selectedFolderIds = new Set<string>()

    for (const entry of payload.selectedTiles) {
      if (entry.source === 'folder') {
        selectedFolderIds.add(entry.tileId)
        continue
      }

      const existing = selectedBySpace.get(entry.spaceId) ?? new Set<string>()
      existing.add(entry.tileId)
      selectedBySpace.set(entry.spaceId, existing)
    }

    const keptFolderItems = editingFolder.items
      .filter((item) => selectedFolderIds.has(item.id))
      .map(stripRestoreOrigin)
    const releasedFolderItems = editingFolder.items
      .filter((item) => !selectedFolderIds.has(item.id))
      .map(stripRestoreOrigin)
    const addedItems = localSpaces.flatMap((space) =>
      space.tiles.flatMap((tile) =>
        tile.kind === 'url' && Boolean(selectedBySpace.get(space.id)?.has(tile.id))
          ? [stripRestoreOrigin(tile)]
          : [],
      ),
    )
    const nextFolderItems = [...keptFolderItems, ...addedItems]

    if (nextFolderItems.length === 0) {
      return
    }

    setSpaces((currentSpaces) =>
      currentSpaces.map((space) => {
        const selectedIds = selectedBySpace.get(space.id)
        const filteredTiles = space.tiles.filter(
          (tile) => !(tile.kind === 'url' && selectedIds?.has(tile.id)),
        )

        if (space.id !== activeSpace.id) {
          return {
            ...space,
            tiles: filteredTiles,
          }
        }

        const folderIndex = filteredTiles.findIndex(
          (tile) => tile.kind === 'folder' && tile.id === editingFolder.id,
        )
        const nextTiles = filteredTiles.map((tile) =>
          tile.kind === 'folder' && tile.id === editingFolder.id
            ? {
                ...tile,
                title: payload.title.trim() || 'Новая папка',
                items: nextFolderItems,
                accent: nextFolderItems[0]?.accent ?? tile.accent,
                icon: nextFolderItems[0]?.icon ?? tile.icon,
              }
            : tile,
        )

        if (releasedFolderItems.length > 0) {
          const insertIndex = folderIndex >= 0 ? folderIndex + 1 : nextTiles.length
          nextTiles.splice(insertIndex, 0, ...releasedFolderItems)
        }

        return {
          ...space,
          tiles: nextTiles,
        }
      }),
    )

    setFolderBuilderModal({
      isOpen: false,
      mode: 'create',
      folderId: null,
    })
    setFolderMenu(null)
  }

  function handleSubmitFolder(payload: { title: string; selectedTiles: FolderSelectionRef[] }) {
    if (folderBuilderModal.mode === 'edit') {
      handleSaveEditedFolder(payload)
      return
    }

    handleCreateFolder(payload)
  }

  function handleSaveSpacesOrder(nextSpaces: Space[]) {
    const currentActiveSpaceId = activeSpace.id
    const hasActiveSpace = nextSpaces.some((space) => space.id === currentActiveSpaceId)
    const nextActiveSpaceId = hasActiveSpace ? currentActiveSpaceId : nextSpaces[0]?.id

    setSpaces(nextSpaces)
    setIsEditSpacesModalOpen(false)

    if (nextActiveSpaceId) {
      setActiveSpaceId(nextActiveSpaceId)
    }
  }

  async function handleDeleteSpace() {
    if (localSpaces.length <= 1) {
      setIsDeleteSpaceModalOpen(false)
      return
    }

    const spaceToDelete = activeSpace
    const nextSpaceIndex =
      currentSpaceIndex > 0 ? currentSpaceIndex - 1 : Math.min(1, localSpaces.length - 1)
    const nextSpaceId = localSpaces[nextSpaceIndex]?.id

    setSpaces((currentSpaces) => currentSpaces.filter((space) => space.id !== spaceToDelete.id))
    setIsDeleteSpaceModalOpen(false)

    if (nextSpaceId) {
      setActiveSpaceId(nextSpaceId)
    }

    const iconsToDelete = collectLocalIcons(spaceToDelete)

    if (iconsToDelete.length === 0) {
      return
    }

    const results = await Promise.allSettled(iconsToDelete.map((iconPath) => deleteIcon(iconPath)))

    if (results.some((result) => result.status === 'rejected')) {
      showToast('warning', 'Пространство удалено, но часть файлов иконок удалить не удалось')
    }
  }

  async function handleDeleteFolder() {
    if (!folderDeleteTarget) {
      return
    }

    const currentFolderDeleteTarget = folderDeleteTarget
    setFolderDeleteTarget(null)

    if (folderModalState.folderId === currentFolderDeleteTarget.id) {
      closeFolderModal()
    }

    startTileExit(currentFolderDeleteTarget.id, async () => {
      setSpaces((currentSpaces) =>
        currentSpaces.map((space, index) =>
          index === currentSpaceIndex
            ? {
                ...space,
                tiles: space.tiles.flatMap((tile) =>
                  tile.id === currentFolderDeleteTarget.id && tile.kind === 'folder'
                    ? currentFolderDeleteTarget.items
                    : [tile],
                ),
              }
            : space,
        ),
      )
    })
  }

  function handleMoveUrlToSpace(spaceId: string) {
    if (!urlMenu) {
      return
    }

    const sourceSpaceId = activeSpace.id
    const sourceFolderId = urlMenu.folderId

    if (!sourceFolderId && sourceSpaceId === spaceId) {
      setUrlMenu(null)
      return
    }

    const activeOpenedFolder =
      openedFolder && openedFolder.kind === 'folder' ? openedFolder : null
    const shouldCloseFolder =
      Boolean(
        sourceFolderId &&
          activeOpenedFolder &&
          activeOpenedFolder.id === sourceFolderId &&
          activeOpenedFolder.items.length === 1,
      )
    const movedTile = stripRestoreOrigin(urlMenu.tile)

    if (shouldCloseFolder) {
      closeFolderModal()
    }

    setUrlMenu(null)
    startTileExit(urlMenu.tile.id, () => {
      setSpaces((currentSpaces) =>
        currentSpaces.map((space) => {
          if (space.id === sourceSpaceId) {
            const nextTiles = [...space.tiles]
            let folderIndex = -1

            if (sourceFolderId) {
              folderIndex = nextTiles.findIndex(
                (tile) => tile.kind === 'folder' && tile.id === sourceFolderId,
              )

              if (folderIndex >= 0) {
                const folderTile = nextTiles[folderIndex]

                if (folderTile?.kind === 'folder') {
                  const nextItems = folderTile.items.filter((item) => item.id !== urlMenu.tile.id)

                  if (nextItems.length === 0) {
                    nextTiles.splice(folderIndex, 1)
                  } else {
                    nextTiles[folderIndex] = {
                      ...folderTile,
                      items: nextItems,
                      accent: nextItems[0]?.accent ?? folderTile.accent,
                      icon: nextItems[0]?.icon ?? folderTile.icon,
                    }
                  }
                }
              }
            } else {
              const tileIndex = nextTiles.findIndex((tile) => tile.kind === 'url' && tile.id === urlMenu.tile.id)
              if (tileIndex >= 0) {
                nextTiles.splice(tileIndex, 1)
              }
            }

            if (spaceId === sourceSpaceId) {
              const insertIndex = folderIndex >= 0 ? Math.min(folderIndex + 1, nextTiles.length) : nextTiles.length
              nextTiles.splice(insertIndex, 0, movedTile)
            }

            return {
              ...space,
              tiles: nextTiles,
            }
          }

          if (space.id !== spaceId) {
            return space
          }

          return {
            ...space,
            tiles: [...space.tiles, movedTile],
          }
        }),
      )
    })
  }

  function handleMoveFolderToSpace(spaceId: string) {
    if (!folderMenu) {
      return
    }

    const sourceSpaceId = activeSpace.id
    if (spaceId === sourceSpaceId) {
      setFolderMenu(null)
      return
    }

    const movedFolder = folderMenu.tile

    if (folderModalState.folderId === movedFolder.id) {
      closeFolderModal()
    }

    setFolderMenu(null)
    startTileExit(movedFolder.id, () => {
      setSpaces((currentSpaces) =>
        currentSpaces.map((space) => {
          if (space.id === sourceSpaceId) {
            return {
              ...space,
              tiles: space.tiles.filter((tile) => tile.id !== movedFolder.id),
            }
          }

          if (space.id !== spaceId) {
            return space
          }

          return {
            ...space,
            tiles: [...space.tiles, movedFolder],
          }
        }),
      )
    })
  }

  function startTileExit(tileId: string, onComplete: () => void | Promise<void>) {
    if (exitingTileTimeoutsRef.current.has(tileId)) {
      return
    }

    const durationMs = isReducedMotion ? 120 : 360

    setExitingTileIds((current) => {
      const next = new Set(current)
      next.add(tileId)
      return next
    })

    const timeoutId = window.setTimeout(() => {
      exitingTileTimeoutsRef.current.delete(tileId)
      setExitingTileIds((current) => {
        const next = new Set(current)
        next.delete(tileId)
        return next
      })
      void onComplete()
    }, durationMs)

    exitingTileTimeoutsRef.current.set(tileId, timeoutId)
  }

  function openBackgroundModal() {
    setSpaceMenu(null)
    setIsBackgroundModalOpen(true)
  }

  function handleSaveBackground(payload: {
    background: SpaceBackground
    applyToAllSpaces: boolean
  }) {
    setSpaces((currentSpaces) =>
      currentSpaces.map((space) =>
        space.background && space.background.type !== 'default'
          ? {
              ...space,
              background: { type: 'default' },
            }
          : space,
      ),
    )

    const nextSettings = sanitizeAppSettings({
      ...appSettings,
      background: payload.background,
    })

    setAppSettings(nextSettings)
    setDraftAppSettings((current) => ({
      ...current,
      background: nextSettings.background,
    }))
    saveAppSettingsToLocalStorage(nextSettings)
    void saveAppSettings(nextSettings).catch(() => {
      showToast('warning', 'Не удалось сохранить настройки фона')
    })
    setIsBackgroundModalOpen(false)
  }

  function showToast(type: 'success' | 'warning' | 'error', text: string) {
    setToast({ id: Date.now(), type, text })
  }

  async function persistSettingsSnapshot(nextSettings: AppSettings, warningText: string) {
    setAppSettings(nextSettings)
    setDraftAppSettings(nextSettings)
    saveAppSettingsToLocalStorage(nextSettings)

    try {
      const savedSettings = mergeSettingsSyncMeta(await saveAppSettings(nextSettings), nextSettings)
      setAppSettings(savedSettings)
      setDraftAppSettings(savedSettings)
      saveAppSettingsToLocalStorage(savedSettings)
    } catch {
      showToast('warning', warningText)
    }
  }

  async function handleExportData() {
    const activeSpaceId = localSpaces[currentSpaceIndex]?.id ?? localSpaces[0]?.id ?? 'main'
    const exportedAt = new Date().toISOString()
    const { file } = await exportLauneyData({
      spaces: toLauneyExportSpaces(localSpaces),
      activeSpaceId,
      settings: appSettings,
    })

    downloadLauneyExport({
      ...file,
      exportedAt,
    })

    const nextSettings = sanitizeAppSettings({
      ...appSettings,
      syncMeta: {
        ...appSettings.syncMeta,
        lastExportAt: exportedAt,
      },
    })

    await persistSettingsSnapshot(nextSettings, 'Экспорт выполнен, но сохранить дату экспорта не удалось')
  }

  async function handleImportData(file: LauneyExportFile) {
    const imported = await importLauneyData(file)
    const nextSpaces = fromLauneyExportSpaces(imported.spaces)
    const importedAt = new Date().toISOString()
    const nextSettings = sanitizeAppSettings({
      ...imported.settings,
      syncMeta: {
        lastExportAt: appSettings.syncMeta.lastExportAt,
        lastImportAt: importedAt,
      },
    })
    const nextActiveSpaceId = imported.activeSpaceId || nextSpaces[0]?.id || 'main'

    setSpaces(nextSpaces)
    setActiveSpaceId(nextActiveSpaceId)
    await persistSpaces(nextSpaces)
    persistActiveSpaceId(nextActiveSpaceId)
    setDecodedIcons(new Set())
    await persistSettingsSnapshot(nextSettings, 'Настройки импортированы, но сохранить их в файл не удалось')

    if (imported.warnings && imported.warnings.length > 0) {
      showToast('warning', 'Импорт завершён с предупреждениями')
    }
  }

  function getBoundedOffset(offset: number) {
    const isAtFirst = currentSpaceIndex === 0
    const isAtLast = currentSpaceIndex === localSpaces.length - 1

    if ((isAtFirst && offset > 0) || (isAtLast && offset < 0)) {
      return offset * 0.25
    }

    return offset
  }

  function resetDragState() {
    dragStateRef.current.pointerId = null
    dragStateRef.current.isHorizontal = null
    dragStateRef.current.startedOnTile = false
    setIsTrackDragging(false)
    setDragOffsetPx(0)
  }

  function handlePagerPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (localSpaces.length <= 1 || isAnyOverlayOpen) {
      resetDragState()
      return
    }

    const target = event.target as HTMLElement | null
    const startedOnTile = Boolean(target?.closest('.tile'))
    dragStateRef.current.startedOnTile = startedOnTile

    if (startedOnTile || isTileDragging) {
      resetDragState()
      return
    }

    dragStateRef.current.pointerId = event.pointerId
    dragStateRef.current.startX = event.clientX
    dragStateRef.current.startY = event.clientY
    dragStateRef.current.lastX = event.clientX
    dragStateRef.current.prevX = event.clientX
    dragStateRef.current.lastTime = performance.now()
    dragStateRef.current.prevTime = dragStateRef.current.lastTime
    dragStateRef.current.isHorizontal = null
  }

  function handlePagerPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (isAnyOverlayOpen) {
      resetDragState()
      return
    }

    if (isTileDragging || dragStateRef.current.startedOnTile) {
      return
    }

    if (dragStateRef.current.pointerId !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - dragStateRef.current.startX
    const deltaY = event.clientY - dragStateRef.current.startY
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (dragStateRef.current.isHorizontal === null && (absX > 6 || absY > 6)) {
      dragStateRef.current.isHorizontal = absX > absY
      if (dragStateRef.current.isHorizontal) {
        prepareForSpaceSwitch()
      }
    }

    if (dragStateRef.current.isHorizontal !== true) {
      return
    }

    if (event.cancelable) {
      event.preventDefault()
    }

    setIsTrackDragging(true)
    setDragOffsetPx(getBoundedOffset(deltaX))
    dragStateRef.current.prevX = dragStateRef.current.lastX
    dragStateRef.current.prevTime = dragStateRef.current.lastTime
    dragStateRef.current.lastX = event.clientX
    dragStateRef.current.lastTime = performance.now()
  }

  function handlePagerPointerEnd(event: ReactPointerEvent<HTMLElement>) {
    if (isAnyOverlayOpen) {
      resetDragState()
      return
    }

    if (isTileDragging || dragStateRef.current.startedOnTile) {
      resetDragState()
      return
    }

    if (dragStateRef.current.pointerId !== event.pointerId) {
      return
    }

    if (dragStateRef.current.isHorizontal !== true) {
      resetDragState()
      return
    }

    const deltaX = event.clientX - dragStateRef.current.startX
    const timeDelta = Math.max(1, dragStateRef.current.lastTime - dragStateRef.current.prevTime)
    const velocityX = ((dragStateRef.current.lastX - dragStateRef.current.prevX) / timeDelta) * 1000
    const exceededDistance = Math.abs(deltaX) > 80
    const exceededVelocity = Math.abs(velocityX) > 500

    if ((exceededDistance || exceededVelocity) && deltaX < 0) {
      switchSpaceByOffset(1)
    } else if ((exceededDistance || exceededVelocity) && deltaX > 0) {
      switchSpaceByOffset(-1)
    }

    resetDragState()
  }

  function handlePagerWheel(event: ReactWheelEvent<HTMLElement>) {
    if (localSpaces.length <= 1 || isAnyOverlayOpen || isTileDragging || isTrackDragging) {
      return
    }

    const now = performance.now()
    const idleResetMs = 220
    const switchThresholdPx = 72

    if (now - wheelSwipeRef.current.lastEventTime > idleResetMs) {
      wheelSwipeRef.current.accumulatedX = 0
      wheelSwipeRef.current.switchedInCurrentGesture = false
    }
    wheelSwipeRef.current.lastEventTime = now

    let horizontalDelta = event.deltaX
    if (Math.abs(horizontalDelta) < 1 && event.shiftKey) {
      horizontalDelta = event.deltaY
    }

    const absX = Math.abs(horizontalDelta)
    const absY = Math.abs(event.deltaY)

    if (absX < 8 || absX < absY * 1.15) {
      return
    }

    if (wheelSwipeRef.current.switchedInCurrentGesture) {
      return
    }

    wheelSwipeRef.current.accumulatedX += horizontalDelta

    if (Math.abs(wheelSwipeRef.current.accumulatedX) < switchThresholdPx) {
      return
    }

    if (event.cancelable) {
      event.preventDefault()
    }

    prepareForSpaceSwitch()
    switchSpaceByOffset(wheelSwipeRef.current.accumulatedX > 0 ? 1 : -1)
    wheelSwipeRef.current.accumulatedX = 0
    wheelSwipeRef.current.switchedInCurrentGesture = true
  }

  const trackTransform = `translate3d(calc(${-currentSpaceIndex * 100}% + ${dragOffsetPx}px), 0, 0)`
  const trackTransition = isTrackDragging
    ? 'none'
    : `transform ${isReducedMotion ? 120 : 480}ms cubic-bezier(0.22, 1, 0.36, 1)`
  const wallpaperBlurPx = Math.round((previewSettings.backgroundBlur / 100) * 28)
  const wallpaperScale = 1 + wallpaperBlurPx / 100
  const wallpaperDimOpacity = (previewSettings.backgroundDim / 100) * 0.65

  return (
    <main className="shell">
      <div
        className={isImageBackground(background) ? 'wallpaper wallpaper-custom-image' : 'wallpaper'}
        style={
          {
            ...(isImageBackground(background) ? { backgroundImage: `url("${background.value}")` } : undefined),
            '--wallpaper-blur': `${wallpaperBlurPx}px`,
            '--wallpaper-scale': wallpaperScale,
            '--wallpaper-dim': wallpaperDimOpacity,
          } as React.CSSProperties
        }
      >
        {isVideoBackground(background) ? (
          <video
            className="wallpaper-video"
            src={background.value}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : null}
      </div>
      <section className="home-screen">
        <Header weatherLocation={appSettings.weatherLocation} />
        <SearchField shouldAutoFocus={autoFocusSearch} onArrowNavigate={switchSpaceByOffset} />
        <section className="space-heading" aria-live="polite">
          <div className={isSpaceTitleEditing ? 'space-title-wrap is-editing' : 'space-title-wrap'}>
            <div
              className={isSpaceTitleEditing ? 'space-title-static is-editing' : 'space-title-static'}
              aria-hidden={isSpaceTitleEditing}
            >
              <h1
                key={activeSpace.id}
                ref={spaceTitleRef}
                className={isReducedMotion ? 'space-title-text no-motion' : 'space-title-text'}
              >
                {activeSpace.title}
              </h1>
              <div className="space-action-wrap" ref={actionBarWrapRef}>
                <ActionBar onOpenSpaceMenu={handleOpenSpaceMenu} />
              </div>
            </div>
            <div
              className={isSpaceTitleEditing ? 'space-title-editor is-editing' : 'space-title-editor'}
              aria-hidden={!isSpaceTitleEditing}
            >
              <input
                ref={spaceTitleInputRef}
                className="space-title-input"
                value={spaceTitleDraft}
                onChange={(event) => setSpaceTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    toggleSpaceTitleEditMode()
                  }
                }}
                aria-label="Название пространства"
                tabIndex={isSpaceTitleEditing ? 0 : -1}
              />
            </div>
          </div>
          <div className="space-heading-controls">
            <button
              ref={editModeButtonRef}
              type="button"
              className={isSpaceTitleEditing ? 'space-edit-button is-active' : 'space-edit-button'}
              onClick={toggleSpaceTitleEditMode}
            >
              <GlowSwap
                as="span"
                swapKey={isSpaceTitleEditing ? 'save' : 'edit'}
                className="space-edit-label"
              >
                {isSpaceTitleEditing ? 'Сохранить' : 'Редактировать'}
              </GlowSwap>
            </button>
            <button type="button" className="space-settings-button" aria-label="Открыть настройки" onClick={openSettingsPanel}>
              <GearSix size={16} weight="fill" />
            </button>
          </div>
        </section>
        <section
          className="spaces-pager-viewport"
          onPointerDown={handlePagerPointerDown}
          onPointerMove={handlePagerPointerMove}
          onPointerUp={handlePagerPointerEnd}
          onPointerCancel={handlePagerPointerEnd}
          onWheel={handlePagerWheel}
          onPointerLeave={(event) => {
            if (dragStateRef.current.pointerId === event.pointerId && isTrackDragging) {
              handlePagerPointerEnd(event)
            }
          }}
        >
          <div
            className="spaces-track"
            style={{
              transform: trackTransform,
              transition: trackTransition,
            }}
          >
            {localSpaces.map((space, spaceIndex) => (
              <section className="space-page" key={space.id} aria-label={`Пространство ${space.title}`}>
                <section className="tiles-viewport">
                  <TilesScrollArea isEmpty={space.tiles.length === 0}>
                    <TileGrid
                      tiles={space.tiles}
                      onAddUrl={openAddUrlModal}
                      onUrlContextMenu={(tile, x, y) => handleUrlContextMenu(tile, x, y)}
                      onFolderContextMenu={handleFolderContextMenu}
                      onOpenFolder={(tile) => openFolderModal(tile.id)}
                      onDeleteUrl={(tile) => setDeleteTarget({ tile })}
                      onDeleteFolder={setFolderDeleteTarget}
                      onTileDragStateChange={setIsTileDragging}
                      isSortableEnabled={currentSpaceIndex === spaceIndex && isGridEditMode}
                      isEditMode={isGridEditMode}
                      exitingTileIds={exitingTileIds}
                      highlightedFolderId={currentSpaceIndex === spaceIndex ? highlightedFolderId : null}
                      onReorderTiles={(nextTiles) => {
                        setSpaces((currentSpaces) =>
                          currentSpaces.map((entry) =>
                            entry.id === space.id
                              ? {
                                  ...entry,
                                  tiles: nextTiles,
                                }
                              : entry,
                          ),
                        )
                      }}
                    />
                  </TilesScrollArea>
                </section>
              </section>
            ))}
          </div>
        </section>
        <div className="space-dots-zone">
          <div className="space-dots-controls">
            <button
              className="space-side-control"
              type="button"
              aria-label="Редактировать порядок пространств"
              onClick={openEditSpacesModal}
            >
              <PencilSimple size={14} weight="fill" />
            </button>
            {localSpaces.length > 1 ? (
              <SpaceDots
                total={localSpaces.length}
                activeIndex={currentSpaceIndex}
                onSelect={switchToSpaceByIndex}
              />
            ) : (
              <nav className="space-dots" aria-label="Пространства">
                <button type="button" className="space-dot is-active" aria-label="Текущее пространство" />
              </nav>
            )}
            <button className="space-side-control" type="button" aria-label="Создать пространство" onClick={openCreateSpaceModal}>
              <Plus size={15} weight="bold" />
            </button>
          </div>
        </div>
      </section>
      {spaceMenu ? (
        <SpaceMenu
          x={spaceMenu.x}
          y={spaceMenu.y}
          canDeleteSpace={localSpaces.length > 1}
          onAddUrl={openAddUrlModal}
          onCreateFolder={openCreateFolderModal}
          onChangeBackground={openBackgroundModal}
          onDeleteSpace={openDeleteSpaceModal}
        />
      ) : null}
      {urlMenu ? (
        <UrlContextMenu
          x={urlMenu.x}
          y={urlMenu.y}
          spaces={localSpaces}
          activeSpaceId={activeSpace.id}
          onEdit={() => openEditUrlModal(urlMenu.tile)}
          onMoveToSpace={handleMoveUrlToSpace}
          onRemoveFromFolder={urlMenu.folderId ? () => handleMoveUrlToSpace(activeSpace.id) : undefined}
          onDelete={() => {
            setDeleteTarget({ tile: urlMenu.tile, folderId: urlMenu.folderId })
            setUrlMenu(null)
          }}
        />
      ) : null}
      {folderMenu ? (
        <FolderContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          spaces={localSpaces}
          activeSpaceId={activeSpace.id}
          onEdit={openEditFolderModal}
          onMoveToSpace={handleMoveFolderToSpace}
          onDelete={openDeleteFolderModal}
        />
      ) : null}
      <FolderModal
        folder={openedFolder && openedFolder.kind === 'folder' ? openedFolder : null}
        isOpen={folderModalState.isOpen && Boolean(openedFolder)}
        onClose={closeFolderModal}
        onExitComplete={handleFolderModalExitComplete}
        onSurfaceClick={() => {
          setUrlMenu(null)
          setFolderMenu(null)
          setSpaceMenu(null)
        }}
        onOpenMenu={(folder, rect) => handleFolderContextMenu(folder, rect.left, rect.bottom + 8)}
        onUrlContextMenu={(tile, x, y) =>
          openedFolder && openedFolder.kind === 'folder'
            ? handleUrlContextMenu(tile, x, y, openedFolder.id)
            : undefined
        }
      />
      <AddUrlModal
        isOpen={urlModal.isOpen}
        mode={urlModal.mode}
        initialValue={
          urlModal.tile
            ? {
                title: urlModal.tile.title,
                url: urlModal.tile.href,
                icon: urlModal.tile.icon,
                addFrame: urlModal.tile.addFrame ?? true,
                iconCustomization: urlModal.tile.iconCustomization,
              }
            : undefined
        }
        onClose={closeUrlModal}
        onSave={handleSaveUrl}
      />
      <DeleteUrlModal
        isOpen={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUrl}
      />
      <ChangeBackgroundModal
        isOpen={isBackgroundModalOpen}
        initialValue={background}
        onClose={() => setIsBackgroundModalOpen(false)}
        onSave={handleSaveBackground}
        onNotify={showToast}
        notifyOnSuccess={!isSettingsOpen}
        showApplyToAllToggle={false}
      />
      <DeleteFolderModal
        isOpen={Boolean(folderDeleteTarget)}
        title={folderDeleteTarget?.title ?? ''}
        onCancel={() => setFolderDeleteTarget(null)}
        onConfirm={handleDeleteFolder}
      />
      <DeleteSpaceModal
        isOpen={isDeleteSpaceModalOpen}
        title={activeSpace.title}
        onCancel={() => setIsDeleteSpaceModalOpen(false)}
        onConfirm={handleDeleteSpace}
      />
      <CreateSpaceModal
        isOpen={isCreateSpaceModalOpen}
        onClose={() => setIsCreateSpaceModalOpen(false)}
        onCreate={handleCreateSpace}
      />
      <CreateFolderModal
        isOpen={folderBuilderModal.isOpen}
        mode={folderBuilderModal.mode}
        spaces={localSpaces}
        editingFolderTitle={editingFolder?.title}
        editingFolderItems={editingFolder?.items}
        onClose={() =>
          setFolderBuilderModal((current) => ({
            ...current,
            isOpen: false,
          }))
        }
        onSubmit={handleSubmitFolder}
      />
      <SettingsWindow
        isOpen={isSettingsOpen}
        draftSettings={draftAppSettings}
        onClose={closeSettingsPanel}
        onDraftSettingsChange={handleDraftSettingsChange}
        onOpenBackgroundPicker={openBackgroundModal}
        onNotify={showToast}
        onNotifySuccess={(text) => showToast('success', text)}
        onExport={handleExportData}
        onImport={handleImportData}
      />
      <EditSpacesOrderModal
        isOpen={isEditSpacesModalOpen}
        spaces={localSpaces}
        onClose={() => setIsEditSpacesModalOpen(false)}
        onSave={handleSaveSpacesOrder}
      />
      <Toast message={toast} />
    </main>
  )
}

interface TilesScrollAreaProps {
  children: ReactNode
  isEmpty: boolean
}

function TilesScrollArea({ children, isEmpty }: TilesScrollAreaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isScrollable, setIsScrollable] = useState(false)

  useLayoutEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    if (isEmpty) {
      setIsScrollable(false)
      return
    }

    const measure = () => {
      const content = container.firstElementChild
      const styles = window.getComputedStyle(container)
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0
      const availableHeight = container.clientHeight - paddingTop
      const contentHeight = content instanceof HTMLElement ? content.getBoundingClientRect().height : 0
      const nextIsScrollable = contentHeight - availableHeight > 1
      setIsScrollable((current) => (current === nextIsScrollable ? current : nextIsScrollable))
    }

    measure()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const resizeObserver = new ResizeObserver(() => {
      measure()
    })

    resizeObserver.observe(container)

    if (container.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(container.firstElementChild)
    }

    window.addEventListener('resize', measure)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [children, isEmpty])

  const className = [
    'tiles-scroll',
    isEmpty ? 'is-empty' : '',
    isScrollable ? 'is-scrollable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}

function collectRemoteIcons(spaces: Space[]) {
  const result = new Set<string>()

  for (const space of spaces) {
    for (const tile of space.tiles) {
      if (tile.kind === 'folder') {
        for (const item of tile.items) {
          if (isRemoteIcon(item.icon)) {
            result.add(item.icon)
          }
        }
        continue
      }

      if (isRemoteIcon(tile.icon)) {
        result.add(tile.icon)
      }
    }
  }

  return [...result]
}

function stripRestoreOrigin(tile: UrlTile): UrlTile {
  return {
    ...tile,
    restoreOrigin: undefined,
  }
}

function replaceRemoteIcons(spaces: Space[], cacheMap: Map<string, string>) {
  return spaces.map((space) => ({
    ...space,
    tiles: space.tiles.map((tile) => {
      if (tile.kind === 'folder') {
        return {
          ...tile,
          items: tile.items.map((item) =>
            cacheMap.has(item.icon)
              ? {
                  ...item,
                  icon: cacheMap.get(item.icon) ?? item.icon,
                }
              : item,
          ),
        }
      }

      return cacheMap.has(tile.icon)
        ? {
            ...tile,
            icon: cacheMap.get(tile.icon) ?? tile.icon,
          }
        : tile
    }),
  }))
}

function collectLocalIconPaths(spaces: Space[]) {
  const result = new Set<string>()

  for (const space of spaces) {
    for (const tile of space.tiles) {
      if (tile.kind === 'folder') {
        for (const item of tile.items) {
          if (isCachedIconPath(item.icon) || isLocalUserIconPath(item.icon)) {
            result.add(item.icon)
          }
        }
        continue
      }

      if (isCachedIconPath(tile.icon) || isLocalUserIconPath(tile.icon)) {
        result.add(tile.icon)
      }
    }
  }

  return result
}

function isRemoteIcon(value: string | undefined) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

async function preloadLocalIcon(iconPath: string) {
  if (!isCachedIconPath(iconPath) && !isLocalUserIconPath(iconPath)) {
    return
  }

  const image = new Image()
  image.src = iconPath

  if (typeof image.decode === 'function') {
    await image.decode().catch(() => undefined)
    return
  }

  await new Promise<void>((resolvePromise) => {
    image.onload = () => resolvePromise()
    image.onerror = () => resolvePromise()
  })
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

function getUpdatedTiles(
  tiles: Space['tiles'],
  payload: AddUrlPayload,
  icon: string | undefined,
  currentTile?: UrlTile,
  folderId?: string,
): Space['tiles'] {
  const nextTile: UrlTile = {
    id: currentTile?.id ?? `url-${Date.now()}`,
    kind: 'url',
    title: payload.title,
    href: normalizeUrl(payload.url),
    accent: currentTile?.accent ?? '#8fb8ff',
    icon: icon ?? getTileFallbackIcon(payload.title),
    addFrame: payload.addFrame,
    iconCustomization: payload.iconCustomization,
    restoreOrigin: currentTile?.restoreOrigin,
  }

  if (!currentTile) {
    return [...tiles, nextTile]
  }

  if (folderId) {
    return tiles.map((tile) =>
      tile.kind === 'folder' && tile.id === folderId
        ? {
            ...tile,
            items: tile.items.map((item) => (item.id === currentTile.id ? nextTile : item)),
          }
        : tile,
    )
  }

  return tiles.map((tile) => (tile.id === currentTile.id ? nextTile : tile))
}

function collectLocalIcons(space: Space) {
  const icons = space.tiles.flatMap((tile) => {
    if (tile.kind === 'folder') {
      return tile.items.map((item) => item.icon)
    }

    return [tile.icon]
  })

  return icons.filter(isLocalUserIconPath)
}

function isImageBackground(background: SpaceBackground): background is Extract<
  SpaceBackground,
  { type: 'image-url' | 'local-image' }
> {
  return background.type === 'image-url' || background.type === 'local-image'
}

function isVideoBackground(background: SpaceBackground): background is Extract<
  SpaceBackground,
  { type: 'video-url' | 'local-video' }
> {
  return background.type === 'video-url' || background.type === 'local-video'
}

function getEffectiveBackground(
  globalBackground: SpaceBackground | undefined,
  legacyBackground: SpaceBackground | undefined,
) {
  if (globalBackground && globalBackground.type !== 'default') {
    return globalBackground
  }

  if (legacyBackground && legacyBackground.type !== 'default') {
    return legacyBackground
  }

  return { type: 'default' } satisfies SpaceBackground
}

interface RgbColor {
  r: number
  g: number
  b: number
}

interface HslColor {
  h: number
  s: number
  l: number
}

async function getAdaptiveModalColors(background: SpaceBackground): Promise<{
  accent: RgbColor
  sliderAccent: RgbColor
}> {
  if (!isImageBackground(background)) {
    return {
      accent: WALLPAPER_ACCENT_FALLBACK,
      sliderAccent: SLIDER_ACCENT_FALLBACK,
    }
  }

  const accentColor = await extractAccentColorFromImage(background.value)

  if (!accentColor) {
    return {
      accent: WALLPAPER_ACCENT_FALLBACK,
      sliderAccent: SLIDER_ACCENT_FALLBACK,
    }
  }

  const normalizedAccent = normalizeAccentColor(accentColor)
  return {
    accent: normalizedAccent,
    sliderAccent: enhanceSliderAccent(normalizedAccent),
  }
}

async function extractAccentColorFromImage(src: string): Promise<RgbColor | null> {
  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.src = src

    if (typeof image.decode === 'function') {
      await image.decode()
    } else {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        image.onload = () => resolvePromise()
        image.onerror = () => rejectPromise(new Error('image-load-failed'))
      })
    }

    const sampleSize = 48
    const canvas = document.createElement('canvas')
    canvas.width = sampleSize
    canvas.height = sampleSize

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    context.drawImage(image, 0, 0, sampleSize, sampleSize)
    const { data } = context.getImageData(0, 0, sampleSize, sampleSize)
    let redTotal = 0
    let greenTotal = 0
    let blueTotal = 0
    let sampleCount = 0

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255
      if (alpha < 0.5) {
        continue
      }

      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      const brightness = getRelativeBrightness(red, green, blue)
      const saturation = getRgbSaturation(red, green, blue)

      if (brightness < 0.18 || brightness > 0.92 || saturation < 0.12) {
        continue
      }

      redTotal += red
      greenTotal += green
      blueTotal += blue
      sampleCount += 1
    }

    if (sampleCount < 12) {
      return null
    }

    return {
      r: Math.round(redTotal / sampleCount),
      g: Math.round(greenTotal / sampleCount),
      b: Math.round(blueTotal / sampleCount),
    }
  } catch (error) {
    if (!hasWarnedAboutAccentExtraction && import.meta.env.DEV) {
      hasWarnedAboutAccentExtraction = true
      console.warn('Unable to extract wallpaper accent for interface accents.', error)
    }

    return null
  }
}

function normalizeAccentColor(color: RgbColor): RgbColor {
  const hsl = rgbToHsl(color)
  return hslToRgb({
    h: hsl.h,
    s: Math.min(hsl.s, 0.35),
    l: Math.min(0.42, Math.max(0.28, hsl.l)),
  })
}

function enhanceSliderAccent(color: RgbColor): RgbColor {
  const hsl = rgbToHsl(color)

  return hslToRgb({
    h: hsl.h,
    s: Math.min(0.58, Math.max(0.28, hsl.s + 0.2)),
    l: Math.min(0.56, Math.max(0.4, hsl.l + 0.11)),
  })
}

function formatRgbCss(color: RgbColor) {
  return `${color.r}, ${color.g}, ${color.b}`
}

function getRelativeBrightness(red: number, green: number, blue: number) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

function getRgbSaturation(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)

  if (max === 0) {
    return 0
  }

  return (max - min) / max
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: lightness }
  }

  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = 0

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0)
  } else if (max === green) {
    hue = (blue - red) / delta + 2
  } else {
    hue = (red - green) / delta + 4
  }

  return { h: hue / 6, s: saturation, l: lightness }
}

function hslToRgb({ h, s, l }: HslColor): RgbColor {
  if (s === 0) {
    const value = Math.round(l * 255)
    return { r: value, g: value, b: value }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const red = hueToRgb(p, q, h + 1 / 3)
  const green = hueToRgb(p, q, h)
  const blue = hueToRgb(p, q, h - 1 / 3)

  return {
    r: Math.round(red * 255),
    g: Math.round(green * 255),
    b: Math.round(blue * 255),
  }
}

function hueToRgb(p: number, q: number, t: number) {
  let hue = t

  if (hue < 0) {
    hue += 1
  }

  if (hue > 1) {
    hue -= 1
  }

  if (hue < 1 / 6) {
    return p + (q - p) * 6 * hue
  }

  if (hue < 1 / 2) {
    return q
  }

  if (hue < 2 / 3) {
    return p + (q - p) * (2 / 3 - hue) * 6
  }

  return p
}

function mergeSettingsSyncMeta(primary: AppSettings, fallback?: Partial<AppSettings> | null) {
  return sanitizeAppSettings({
    ...primary,
    syncMeta: {
      lastExportAt: primary.syncMeta.lastExportAt ?? fallback?.syncMeta?.lastExportAt ?? null,
      lastImportAt: primary.syncMeta.lastImportAt ?? fallback?.syncMeta?.lastImportAt ?? null,
    },
  })
}
