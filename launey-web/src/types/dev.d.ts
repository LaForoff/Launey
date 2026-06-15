declare global {
  interface Window {
    __launeyResetFromArcImport?: () => Promise<boolean>
    __launeyCacheRemoteIcons?: () => Promise<{
      found: number
      cached: number
      errors: number
    }>
  }
}

export {}
