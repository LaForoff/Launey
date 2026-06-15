import type { AppSettings } from './settingsApi'
import type { FolderTile, IconCustomization, Space, UrlTile } from '../types/space'

export interface LauneyExportUrlItem {
  type: 'url'
  id: string
  title: string
  url: string
  icon: string
  addFrame: boolean
  iconCustomization?: IconCustomization
  restoreOrigin?: {
    spaceId: string
    tileIndex: number
  }
}

export interface LauneyExportFolderItem {
  type: 'folder'
  id: string
  title: string
  icon?: string
  items: LauneyExportUrlItem[]
}

export interface LauneyExportSpace {
  id: string
  title: string
  background?: Space['background']
  items: Array<LauneyExportUrlItem | LauneyExportFolderItem>
}

export interface LauneyExportFile {
  version: number
  app: 'Launey'
  exportedAt: string
  settings: AppSettings
  spaces: LauneyExportSpace[]
  activeSpaceId: string
  assets: {
    icons: Record<string, { mimeType: string; data: string }>
  }
  warnings?: string[]
}

export function toLauneyExportSpaces(spaces: Space[]): LauneyExportSpace[] {
  return spaces.map((space) => ({
    id: space.id,
    title: space.title,
    background: space.background,
    items: space.tiles.map((tile) =>
      tile.kind === 'folder'
        ? {
            type: 'folder',
            id: tile.id,
            title: tile.title,
            icon: tile.icon,
            items: tile.items.map((item) => ({
              type: 'url',
              id: item.id,
              title: item.title,
              url: item.href,
              icon: item.icon,
              addFrame: item.addFrame ?? true,
              iconCustomization: item.iconCustomization,
              restoreOrigin: item.restoreOrigin,
            })),
          }
        : {
            type: 'url',
            id: tile.id,
            title: tile.title,
            url: tile.href,
            icon: tile.icon,
            addFrame: tile.addFrame ?? true,
            iconCustomization: tile.iconCustomization,
            restoreOrigin: tile.restoreOrigin,
          },
    ),
  }))
}

export function fromLauneyExportSpaces(spaces: LauneyExportSpace[]): Space[] {
  return spaces.map((space) => ({
    id: space.id,
    title: space.title,
    background: space.background,
    tiles: space.items.map((item) => (item.type === 'folder' ? fromFolderItem(item) : fromUrlItem(item))),
  }))
}

function fromFolderItem(item: LauneyExportFolderItem): FolderTile {
  return {
    kind: 'folder',
    id: item.id,
    title: item.title,
    accent: '#8fb8ff',
    icon: item.icon ?? '',
    items: item.items.map(fromUrlItem),
  }
}

function fromUrlItem(item: LauneyExportUrlItem): UrlTile {
  return {
    kind: 'url',
    id: item.id,
    title: item.title,
    href: item.url,
    accent: '#8fb8ff',
    icon: item.icon,
    addFrame: item.addFrame,
    iconCustomization: item.iconCustomization,
    restoreOrigin: item.restoreOrigin,
  }
}
