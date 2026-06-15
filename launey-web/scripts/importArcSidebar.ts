import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type JsonRecord = Record<string, unknown>

interface ArcRecord {
  id: string
  title?: string | null
  parentID?: string | null
  childrenIds?: unknown
  containerIDs?: unknown
  newContainerIDs?: unknown
  data?: JsonRecord
}

interface OutputUrlItem {
  type: 'url'
  id: string
  title: string
  url: string
  icon: ''
  addFrame: true
}

interface OutputFolderItem {
  type: 'folder'
  id: string
  title: string
  items: OutputItem[]
}

type OutputItem = OutputUrlItem | OutputFolderItem

interface OutputSpace {
  id: string
  title: string
  items: OutputItem[]
}

interface OutputPayload {
  spaces: OutputSpace[]
}

const INPUT_PATH = resolve(process.cwd(), 'import/StorableSidebar.json')
const OUTPUT_PATH = resolve(process.cwd(), 'import/launey-spaces-from-arc.json')
const FALLBACK_SPACE_ID = 'arc-import'
const FALLBACK_SPACE_TITLE = 'Импорт Arc'

function main() {
  const rawSidebar = JSON.parse(readFileSync(INPUT_PATH, 'utf8')) as {
    sidebarSyncState?: {
      items?: unknown[]
      spaceModels?: unknown[]
      container?: { value?: { orderedSpaceIDs?: unknown } }
    }
  }

  const sidebar = rawSidebar.sidebarSyncState

  if (!sidebar) {
    throw new Error('Не найден sidebarSyncState в import/StorableSidebar.json')
  }

  const records = extractModelValues(sidebar.items)
  const recordById = new Map(records.map((record) => [record.id, record]))
  const tabs = records.filter(isTabRecord)
  const lists = records.filter(isListRecord)
  const containers = records.filter(isItemContainerRecord)
  const listById = new Map(lists.map((record) => [record.id, record]))
  const containerById = new Map(containers.map((record) => [record.id, record]))

  const spaces = orderSpaces(
    extractSpaceRecords(sidebar.spaceModels, recordById),
    normalizeStringArray(sidebar.container?.value?.orderedSpaceIDs),
  )
  const spaceById = new Map(spaces.map((space) => [space.id, space]))

  const containerSpaceById = new Map<string, string>()

  for (const container of containers) {
    const explicitSpaceId = getContainerSpaceId(container)
    if (explicitSpaceId) {
      containerSpaceById.set(container.id, explicitSpaceId)
    }
  }

  for (const space of spaces) {
    for (const containerId of collectContainerIds(space)) {
      containerSpaceById.set(containerId, space.id)
    }
  }

  const resolvedSpaceByRecordId = new Map<string, string | null>()

  function resolveSpaceId(recordId: string): string | null {
    if (resolvedSpaceByRecordId.has(recordId)) {
      return resolvedSpaceByRecordId.get(recordId) ?? null
    }

    const visited = new Set<string>()
    let current = recordById.get(recordId)

    while (current && !visited.has(current.id)) {
      visited.add(current.id)

      if (spaceById.has(current.id)) {
        resolvedSpaceByRecordId.set(recordId, current.id)
        return current.id
      }

      if (current.parentID && containerSpaceById.has(current.parentID)) {
        const resolved = containerSpaceById.get(current.parentID) ?? null
        resolvedSpaceByRecordId.set(recordId, resolved)
        return resolved
      }

      if (current.parentID && listById.has(current.parentID)) {
        current = listById.get(current.parentID)
        continue
      }

      if (current.parentID) {
        current = recordById.get(current.parentID)
        continue
      }

      break
    }

    resolvedSpaceByRecordId.set(recordId, null)
    return null
  }

  const outputSpaceById = new Map<string, OutputSpace>()
  for (const space of spaces) {
    outputSpaceById.set(space.id, {
      id: space.id,
      title: normalizeSpaceTitle(space.title, space.id),
      items: [],
    })
  }

  const assignedTabIds = new Set<string>()
  const assignedListIds = new Set<string>()
  const producedItemIds = new Set<string>()
  let skippedUrlCount = 0
  let folderCount = 0
  let urlCount = 0

  function tryCreateUrlItem(record: ArcRecord): OutputUrlItem | null {
    const rawUrl = record.data?.tab?.savedURL
    if (typeof rawUrl !== 'string') {
      skippedUrlCount += 1
      return null
    }

    const trimmedUrl = rawUrl.trim()
    if (!trimmedUrl) {
      skippedUrlCount += 1
      return null
    }

    const rawTitle = typeof record.data?.tab?.savedTitle === 'string' ? record.data.tab.savedTitle : record.title
    const title = normalizeItemTitle(rawTitle, trimmedUrl)

    return {
      type: 'url',
      id: record.id,
      title,
      url: trimmedUrl,
      icon: '',
      addFrame: true,
    }
  }

  function buildFolder(record: ArcRecord): OutputFolderItem | null {
    const visitedLists = new Set<string>()
    const nestedIds = new Set<string>()

    function visitList(current: ArcRecord): OutputFolderItem | null {
      if (visitedLists.has(current.id)) {
        return null
      }

      visitedLists.add(current.id)
      nestedIds.add(current.id)

      const items: OutputItem[] = []

      for (const childId of normalizeStringArray(current.childrenIds)) {
        const child = recordById.get(childId)
        if (!child) {
          continue
        }

        if (isTabRecord(child)) {
          const urlItem = tryCreateUrlItem(child)
          if (!urlItem) {
            continue
          }

          items.push(urlItem)
          assignedTabIds.add(child.id)
          continue
        }

        if (isListRecord(child)) {
          const nestedFolder = visitList(child)
          if (!nestedFolder) {
            continue
          }

          items.push(nestedFolder)
        }
      }

      if (items.length === 0) {
        return null
      }

      return {
        type: 'folder',
        id: current.id,
        title: normalizeText(current.title, 'Папка'),
        items,
      }
    }

    const folder = visitList(record)

    if (!folder) {
      return null
    }

    for (const listId of nestedIds) {
      assignedListIds.add(listId)
    }

    return folder
  }

  function pushItemToSpace(spaceId: string, item: OutputItem) {
    const space = outputSpaceById.get(spaceId)
    if (!space || producedItemIds.has(item.id)) {
      return
    }

    space.items.push(item)
    producedItemIds.add(item.id)

    if (item.type === 'folder') {
      folderCount += 1
      urlCount += countUrls(item.items)
    } else {
      urlCount += 1
    }
  }

  for (const space of spaces) {
    for (const containerId of collectContainerIds(space)) {
      const container = containerById.get(containerId)
      if (!container) {
        continue
      }

      for (const childId of normalizeStringArray(container.childrenIds)) {
        const child = recordById.get(childId)
        if (!child) {
          continue
        }

        if (isTabRecord(child)) {
          const urlItem = tryCreateUrlItem(child)
          if (!urlItem) {
            continue
          }

          assignedTabIds.add(child.id)
          pushItemToSpace(space.id, urlItem)
          continue
        }

        if (isListRecord(child)) {
          const folder = buildFolder(child)
          if (!folder) {
            continue
          }

          pushItemToSpace(space.id, folder)
        }
      }
    }
  }

  for (const list of lists) {
    if (assignedListIds.has(list.id)) {
      continue
    }

    const resolvedSpaceId = resolveSpaceId(list.id)
    if (!resolvedSpaceId) {
      continue
    }

    const folder = buildFolder(list)
    if (!folder) {
      continue
    }

    pushItemToSpace(resolvedSpaceId, folder)
  }

  const unresolvedUrlItems: OutputUrlItem[] = []

  for (const tab of tabs) {
    if (assignedTabIds.has(tab.id)) {
      continue
    }

    const urlItem = tryCreateUrlItem(tab)
    if (!urlItem) {
      continue
    }

    const resolvedSpaceId = resolveSpaceId(tab.id)
    if (!resolvedSpaceId || !outputSpaceById.has(resolvedSpaceId)) {
      unresolvedUrlItems.push(urlItem)
      continue
    }

    assignedTabIds.add(tab.id)
    pushItemToSpace(resolvedSpaceId, urlItem)
  }

  if (unresolvedUrlItems.length > 0 || outputSpaceById.size === 0) {
    const fallbackSpace = outputSpaceById.get(FALLBACK_SPACE_ID) ?? {
      id: FALLBACK_SPACE_ID,
      title: FALLBACK_SPACE_TITLE,
      items: [],
    }

    for (const item of unresolvedUrlItems) {
      if (producedItemIds.has(item.id)) {
        continue
      }

      fallbackSpace.items.push(item)
      producedItemIds.add(item.id)
      urlCount += 1
    }

    outputSpaceById.set(FALLBACK_SPACE_ID, fallbackSpace)
  }

  const outputSpaces = [
    ...spaces.map((space) => outputSpaceById.get(space.id)).filter((space): space is OutputSpace => Boolean(space)),
    ...(outputSpaceById.has(FALLBACK_SPACE_ID) ? [outputSpaceById.get(FALLBACK_SPACE_ID)!] : []),
  ].filter((space) => space.items.length > 0 || space.id === FALLBACK_SPACE_ID)

  const payload: OutputPayload = { spaces: outputSpaces }
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(`Найдено spaces: ${spaces.length}`)
  console.log(`Найдено folders: ${folderCount}`)
  console.log(`Найдено URL: ${urlCount}`)
  console.log(`URL пропущено: ${skippedUrlCount}`)
}

function extractModelValues(models: unknown[] | undefined): ArcRecord[] {
  if (!Array.isArray(models)) {
    return []
  }

  return models
    .filter((entry): entry is { value: ArcRecord } => isObject(entry) && isObject(entry.value))
    .map((entry) => entry.value)
    .filter((value): value is ArcRecord => typeof value.id === 'string')
}

function extractSpaceRecords(spaceModels: unknown[] | undefined, recordById: Map<string, ArcRecord>) {
  const directRecords = extractModelValues(spaceModels)
  const seenIds = new Set(directRecords.map((record) => record.id))
  const resolvedFromIds: ArcRecord[] = []

  for (const entry of spaceModels ?? []) {
    if (typeof entry !== 'string' || seenIds.has(entry)) {
      continue
    }

    const record = recordById.get(entry)
    if (!record) {
      continue
    }

    resolvedFromIds.push(record)
    seenIds.add(entry)
  }

  return [...directRecords, ...resolvedFromIds]
}

function orderSpaces(spaceRecords: ArcRecord[], orderedIds: string[]) {
  const byId = new Map(spaceRecords.map((record) => [record.id, record]))
  const ordered: ArcRecord[] = []
  const used = new Set<string>()

  for (const id of orderedIds) {
    const record = byId.get(id)
    if (!record) {
      continue
    }

    ordered.push(record)
    used.add(id)
  }

  for (const record of spaceRecords) {
    if (used.has(record.id)) {
      continue
    }

    ordered.push(record)
  }

  return ordered
}

function isTabRecord(record: ArcRecord) {
  return isObject(record.data?.tab)
}

function isListRecord(record: ArcRecord) {
  return isObject(record.data?.list)
}

function isItemContainerRecord(record: ArcRecord) {
  return isObject(record.data?.itemContainer)
}

function getContainerSpaceId(record: ArcRecord) {
  const containerType = record.data?.itemContainer?.containerType
  if (!isObject(containerType)) {
    return null
  }

  const spaceItems = containerType.spaceItems
  if (!isObject(spaceItems) || typeof spaceItems._0 !== 'string') {
    return null
  }

  return spaceItems._0
}

function collectContainerIds(spaceRecord: ArcRecord) {
  const rawIds = [
    ...normalizeStringArray(spaceRecord.containerIDs),
    ...normalizeStringArray(spaceRecord.newContainerIDs),
  ]

  return [...new Set(rawIds.filter((id) => id !== 'pinned' && id !== 'unpinned'))]
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

function normalizeText(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizeSpaceTitle(value: unknown, id: string) {
  if (id === 'thebrowser.company.defaultPersonalSpaceID') {
    return 'Главное'
  }

  return normalizeText(value, id)
}

function normalizeItemTitle(value: unknown, url: string) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }

  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function countUrls(items: OutputItem[]): number {
  let total = 0

  for (const item of items) {
    if (item.type === 'url') {
      total += 1
      continue
    }

    total += countUrls(item.items)
  }

  return total
}

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object'
}

main()
