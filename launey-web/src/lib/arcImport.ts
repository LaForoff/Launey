import type { FolderTile, Space, UrlTile } from '../types/space'

const DEFAULT_ACCENT = '#8fb8ff'

type RawUrlItem = {
  type?: unknown
  id?: unknown
  title?: unknown
  url?: unknown
  icon?: unknown
  addFrame?: unknown
}

type RawFolderItem = {
  type?: unknown
  id?: unknown
  title?: unknown
  items?: unknown
}

type RawSpace = {
  id?: unknown
  title?: unknown
  items?: unknown
}

type RawArcPayload = {
  spaces?: unknown
}

export function parseArcImportPayload(payload: unknown): Space[] | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const maybePayload = payload as RawArcPayload

  if (!Array.isArray(maybePayload.spaces)) {
    return null
  }

  const spaces = maybePayload.spaces
    .map((space, index) => parseRawSpace(space, index))
    .filter((space): space is Space => Boolean(space))

  return spaces.length > 0 ? spaces : null
}

function parseRawSpace(rawSpace: unknown, index: number): Space | null {
  if (!rawSpace || typeof rawSpace !== 'object') {
    return null
  }

  const maybeSpace = rawSpace as RawSpace
  const id = normalizeString(maybeSpace.id) ?? `arc-space-${index + 1}`
  const title = normalizeString(maybeSpace.title) ?? `Space ${index + 1}`
  const items = Array.isArray(maybeSpace.items) ? maybeSpace.items : []
  const tiles = items
    .map((item, itemIndex) => parseRawItem(item, id, itemIndex))
    .filter((tile): tile is Space['tiles'][number] => Boolean(tile))

  return {
    id,
    title,
    tiles,
  }
}

function parseRawItem(rawItem: unknown, spaceId: string, index: number) {
  if (!rawItem || typeof rawItem !== 'object') {
    return null
  }

  const type = normalizeString((rawItem as { type?: unknown }).type)

  if (type === 'url') {
    return parseRawUrlItem(rawItem as RawUrlItem, spaceId, index)
  }

  if (type === 'folder') {
    return parseRawFolderItem(rawItem as RawFolderItem, spaceId, index)
  }

  return null
}

function parseRawUrlItem(rawItem: RawUrlItem, spaceId: string, index: number): UrlTile | null {
  const href = normalizeString(rawItem.url)

  if (!href) {
    return null
  }

  const id = normalizeString(rawItem.id) ?? `${spaceId}-url-${index + 1}`
  const title = normalizeString(rawItem.title) ?? getTitleFromUrl(href)

  return {
    id,
    kind: 'url',
    title,
    href,
    accent: DEFAULT_ACCENT,
    icon: '',
    addFrame: rawItem.addFrame === false ? false : true,
  }
}

function parseRawFolderItem(rawItem: RawFolderItem, spaceId: string, index: number): FolderTile | null {
  const rawChildren = Array.isArray(rawItem.items) ? rawItem.items : []
  const flatUrls = flattenFolderUrls(rawChildren, spaceId, `${normalizeString(rawItem.id) ?? index}`)

  if (flatUrls.length === 0) {
    return null
  }

  return {
    id: normalizeString(rawItem.id) ?? `${spaceId}-folder-${index + 1}`,
    kind: 'folder',
    title: normalizeString(rawItem.title) ?? `Папка ${index + 1}`,
    accent: DEFAULT_ACCENT,
    icon: '',
    items: dedupeUrlsById(flatUrls),
  }
}

function flattenFolderUrls(rawItems: unknown[], spaceId: string, seed: string): UrlTile[] {
  const result: UrlTile[] = []

  for (let index = 0; index < rawItems.length; index += 1) {
    const rawItem = rawItems[index]

    if (!rawItem || typeof rawItem !== 'object') {
      continue
    }

    const type = normalizeString((rawItem as { type?: unknown }).type)

    if (type === 'url') {
      const urlTile = parseRawUrlItem(rawItem as RawUrlItem, spaceId, index)

      if (urlTile) {
        result.push(urlTile)
      }

      continue
    }

    if (type === 'folder') {
      const nestedFolder = rawItem as RawFolderItem
      const nestedItems = Array.isArray(nestedFolder.items) ? nestedFolder.items : []

      result.push(...flattenFolderUrls(nestedItems, spaceId, `${seed}-${index + 1}`))
    }
  }

  return result
}

function dedupeUrlsById(items: UrlTile[]) {
  const seenIds = new Set<string>()

  return items.filter((item) => {
    if (seenIds.has(item.id)) {
      return false
    }

    seenIds.add(item.id)
    return true
  })
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getTitleFromUrl(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname
  } catch {
    return rawUrl
  }
}

