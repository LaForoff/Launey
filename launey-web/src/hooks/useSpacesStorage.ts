import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import type { Space, Tile, UrlTile } from '../types/space'
import { isBlobIconPath, isStoredIconPath } from '../lib/iconApi'
import { getTileFallbackIcon } from '../lib/urlTile'
import { parseArcImportPayload } from '../lib/arcImport'
import { normalizeIconCustomization } from '../lib/iconCustomization'

const STORAGE_KEY = 'launey.spaces'
const ACTIVE_SPACE_KEY = 'launey.activeSpaceId'
const DATABASE_NAME = 'launey-storage'
const STORE_NAME = 'app-state'
const SPACES_RECORD_KEY = 'spaces'

export function useSpacesStorage(defaultSpaces: Space[], defaultActiveSpaceIndex: number) {
  const defaultActiveSpaceId = defaultSpaces[defaultActiveSpaceIndex]?.id ?? defaultSpaces[0]?.id
  const [spaces, setSpaces] = useState<Space[]>(defaultSpaces)
  const [isHydrated, setIsHydrated] = useState(false)
  const hasManualSpacesUpdateRef = useRef(false)
  const [activeSpaceId, setActiveSpaceId] = useState<string>(() =>
    readActiveSpaceId(defaultActiveSpaceId),
  )
  const resolvedActiveSpaceId = spaces.some((space) => space.id === activeSpaceId)
    ? activeSpaceId
    : (spaces[0]?.id ?? activeSpaceId)

  const activeSpaceIndex = useMemo(() => {
    const index = spaces.findIndex((space) => space.id === resolvedActiveSpaceId)

    return index >= 0 ? index : 0
  }, [resolvedActiveSpaceId, spaces])

  const setSpacesTracked = useCallback((nextState: SetStateAction<Space[]>) => {
    hasManualSpacesUpdateRef.current = true
    setSpaces(nextState)
  }, [])

  const persistSpaces = useCallback(async (nextSpaces: Space[]) => {
    await writeSpaces(nextSpaces)
  }, [])

  const persistActiveSpaceId = useCallback((nextActiveSpaceId: string) => {
    try {
      window.localStorage.setItem(ACTIVE_SPACE_KEY, nextActiveSpaceId)
    } catch {
      // Ignore localStorage write failures.
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    void readSpaces(defaultSpaces).then((nextSpaces) => {
      if (isCancelled) {
        return
      }

      if (hasManualSpacesUpdateRef.current) {
        setIsHydrated(true)
        return
      }

      setSpaces(nextSpaces)
      setIsHydrated(true)
    })

    return () => {
      isCancelled = true
    }
  }, [defaultSpaces])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    window.__launeyResetFromArcImport = async () => {
      const importedSpaces = await readSpacesFromArcImportFile()

      if (!importedSpaces || importedSpaces.length === 0) {
        return false
      }

      const normalizedSpaces = importedSpaces.map(normalizeSpace)
      setSpacesTracked(normalizedSpaces)
      setActiveSpaceId(normalizedSpaces[0]?.id ?? defaultActiveSpaceId)
      return true
    }

    return () => {
      delete window.__launeyResetFromArcImport
    }
  }, [defaultActiveSpaceId])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    void writeSpaces(spaces)
  }, [isHydrated, spaces])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    const nextActiveSpaceId = spaces[activeSpaceIndex]?.id ?? resolvedActiveSpaceId

    if (nextActiveSpaceId) {
      window.localStorage.setItem(ACTIVE_SPACE_KEY, nextActiveSpaceId)
    }
  }, [activeSpaceIndex, isHydrated, resolvedActiveSpaceId, spaces])

  return {
    spaces,
    setSpaces: setSpacesTracked,
    persistSpaces,
    persistActiveSpaceId,
    activeSpaceIndex,
    activeSpaceId: resolvedActiveSpaceId,
    setActiveSpaceId,
  }
}

async function readSpaces(defaultSpaces: Space[]) {
  const indexedDbSpaces = await readSpacesFromIndexedDb()

  if (indexedDbSpaces) {
    return indexedDbSpaces
  }

  const localStorageSpaces = readSpacesFromLocalStorage()

  if (localStorageSpaces) {
    void writeSpacesToIndexedDb(localStorageSpaces)
    return localStorageSpaces
  }

  const arcImportedSpaces = await readSpacesFromArcImportFile()

  if (arcImportedSpaces) {
    return arcImportedSpaces
  }

  return defaultSpaces
}

async function writeSpaces(spaces: Space[]) {
  let isLocalStorageWritten = false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces))
    isLocalStorageWritten = true
  } catch {
    try {
      // If the fresh snapshot does not fit, drop the stale copy so reload falls back to IndexedDB.
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore localStorage cleanup failures.
    }
  }

  const isIndexedDbWritten = await writeSpacesToIndexedDb(spaces)

  if (!isIndexedDbWritten && !isLocalStorageWritten) {
    // Если браузер не дал ни IndexedDB, ни localStorage, оставляем данные в памяти.
  }
}

function readSpacesFromLocalStorage() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
      return null
    }

      const validSpaces = parsedValue.filter(isSpace).map(normalizeSpace)

      return validSpaces.length > 0 ? validSpaces : null
  } catch {
    return null
  }
}

async function readSpacesFromIndexedDb() {
  const database = await openDatabase()

  if (!database) {
    return null
  }

  return new Promise<Space[] | null>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(SPACES_RECORD_KEY)

    request.onsuccess = () => {
      const parsedValue = request.result

      if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
        resolve(null)
        return
      }

      const validSpaces = parsedValue.filter(isSpace).map(normalizeSpace)
      resolve(validSpaces.length > 0 ? validSpaces : null)
    }

    request.onerror = () => resolve(null)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => database.close()
    transaction.onabort = () => database.close()
  })
}

async function writeSpacesToIndexedDb(spaces: Space[]) {
  const database = await openDatabase()

  if (!database) {
    return false
  }

  return new Promise<boolean>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')

    transaction.objectStore(STORE_NAME).put(spaces, SPACES_RECORD_KEY)
    transaction.oncomplete = () => {
      database.close()
      resolve(true)
    }
    transaction.onerror = () => {
      database.close()
      resolve(false)
    }
    transaction.onabort = () => {
      database.close()
      resolve(false)
    }
  })
}

function openDatabase() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve<IDBDatabase | null>(null)
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function readActiveSpaceId(defaultActiveSpaceId: string) {
  try {
    return window.localStorage.getItem(ACTIVE_SPACE_KEY) ?? defaultActiveSpaceId
  } catch {
    return defaultActiveSpaceId
  }
}

function isSpace(value: unknown): value is Space {
  if (!value || typeof value !== 'object') {
    return false
  }

  const maybeSpace = value as Space

  return (
    typeof maybeSpace.id === 'string' &&
    typeof maybeSpace.title === 'string' &&
    Array.isArray(maybeSpace.tiles) &&
    maybeSpace.tiles.every(isTile) &&
    (typeof maybeSpace.background === 'undefined' || isSpaceBackground(maybeSpace.background))
  )
}

function isSpaceBackground(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }

  const maybeBackground = value as Space['background']

  if (!maybeBackground) {
    return false
  }

  if (maybeBackground.type === 'default') {
    return true
  }

  return (
    ['image-url', 'video-url', 'local-image', 'local-video'].includes(maybeBackground.type) &&
    typeof maybeBackground.value === 'string'
  )
}

function isTile(value: unknown): value is Tile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const maybeTile = value as Tile

  if (
    typeof maybeTile.id !== 'string' ||
    typeof maybeTile.title !== 'string' ||
    typeof maybeTile.accent !== 'string' ||
    typeof maybeTile.icon !== 'string'
  ) {
    return false
  }

  if (maybeTile.kind === 'url') {
    return (
      typeof maybeTile.href === 'string' &&
      (typeof maybeTile.addFrame === 'undefined' || typeof maybeTile.addFrame === 'boolean') &&
      (typeof maybeTile.iconCustomization === 'undefined' || isIconCustomization(maybeTile.iconCustomization))
    )
  }

  if (maybeTile.kind === 'folder') {
    return Array.isArray(maybeTile.items)
  }

  return false
}

function isIconCustomization(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }

  const maybeCustomization = value as UrlTile['iconCustomization']

  return (
    typeof maybeCustomization?.scale === 'number' &&
    typeof maybeCustomization.hasBackground === 'boolean' &&
    typeof maybeCustomization.backgroundColor === 'string' &&
    (typeof maybeCustomization.volumeAlpha === 'undefined' || typeof maybeCustomization.volumeAlpha === 'number') &&
    (typeof maybeCustomization.volumePlacement === 'undefined' ||
      maybeCustomization.volumePlacement === 'below' ||
      maybeCustomization.volumePlacement === 'above') &&
    (typeof maybeCustomization.edgeAlpha === 'undefined' || typeof maybeCustomization.edgeAlpha === 'number') &&
    (typeof maybeCustomization.edgeThickness === 'undefined' || typeof maybeCustomization.edgeThickness === 'number')
  )
}

function normalizeSpace(space: Space): Space {
  return {
    ...space,
    tiles: space.tiles.map(normalizeTile),
  }
}

function normalizeTile(tile: Tile): Tile {
  if (tile.kind === 'folder') {
    return {
      ...tile,
      items: tile.items.map((item) => normalizeUrlTile(item)),
    }
  }

  return normalizeUrlTile(tile)
}

function normalizeUrlTile(tile: UrlTile): UrlTile {
  const iconValue = tile.icon
  const icon =
    isBlobIconPath(iconValue) || (!isStoredIconPath(iconValue) && iconValue.length === 0)
      ? getTileFallbackIcon(tile.title)
      : iconValue

  return {
    ...tile,
    icon,
    iconCustomization: tile.iconCustomization ? normalizeIconCustomization(tile.iconCustomization) : undefined,
  }
}

async function readSpacesFromArcImportFile() {
  try {
    const response = await fetch('/api/arc-import-spaces')

    if (!response.ok) {
      return null
    }

    const parsedPayload = parseArcImportPayload((await response.json()) as unknown)

    return parsedPayload && parsedPayload.length > 0 ? parsedPayload : null
  } catch {
    return null
  }
}
