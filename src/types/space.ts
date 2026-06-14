export type TileKind = 'url' | 'folder'

export type SpaceBackground =
  | { type: 'default' }
  | { type: 'image-url'; value: string }
  | { type: 'video-url'; value: string }
  | { type: 'local-image'; value: string; fileName?: string }
  | { type: 'local-video'; value: string; fileName?: string }

export interface BaseTile {
  id: string
  title: string
  accent: string
  icon: string
}

export interface UrlTile extends BaseTile {
  kind: 'url'
  href: string
  addFrame?: boolean
  iconCustomization?: IconCustomization
  restoreOrigin?: {
    spaceId: string
    tileIndex: number
  }
}

export interface IconCustomization {
  scale: number
  hasBackground: boolean
  backgroundColor: string
  volumeAlpha: number
  volumePlacement: 'below' | 'above'
  edgeAlpha: number
  edgeThickness: number
}

export interface FolderTile extends BaseTile {
  kind: 'folder'
  items: UrlTile[]
}

export type Tile = UrlTile | FolderTile

export interface Space {
  id: string
  title: string
  tiles: Tile[]
  background?: SpaceBackground
}
