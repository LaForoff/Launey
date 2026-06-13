import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const buildInfoPath = resolve(process.cwd(), 'src/config/buildInfo.ts')
const projectRoots = [
  resolve(process.cwd(), 'src'),
  resolve(process.cwd(), 'scripts'),
  resolve(process.cwd(), 'vite.plugins'),
]
const projectFiles = [
  resolve(process.cwd(), 'package.json'),
  resolve(process.cwd(), 'vite.config.ts'),
  resolve(process.cwd(), 'tsconfig.json'),
  resolve(process.cwd(), 'tsconfig.app.json'),
  resolve(process.cwd(), 'tsconfig.node.json'),
]

export function lastEditBuildInfoPlugin(): Plugin {
  let isUpdating = false

  const refreshBuildInfo = () => {
    if (isUpdating) {
      return
    }

    isUpdating = true

    try {
      const source = readFileSync(buildInfoPath, 'utf8')
      const latestEditAt = new Date(getLatestProjectEditMs()).toISOString()
      const updated = source.replace(
        /lastUpdatedAt:\s*'[^']*'/,
        `lastUpdatedAt: '${latestEditAt}'`,
      )

      if (updated !== source) {
        writeFileSync(buildInfoPath, updated)
      }
    } finally {
      isUpdating = false
    }
  }

  return {
    name: 'last-edit-build-info',
    buildStart() {
      refreshBuildInfo()
    },
    configureServer(server) {
      refreshBuildInfo()

      const maybeRefresh = (filePath: string) => {
        if (resolve(filePath) === buildInfoPath) {
          return
        }

        refreshBuildInfo()
      }

      server.watcher.on('add', maybeRefresh)
      server.watcher.on('change', maybeRefresh)
      server.watcher.on('unlink', maybeRefresh)
    },
  }
}

function getLatestProjectEditMs() {
  const timestamps = [
    ...projectRoots.map((rootPath) => collectLatestMtime(rootPath)),
    ...projectFiles.map((filePath) => getFileMtime(filePath)),
  ].filter(Number.isFinite)

  return timestamps.length > 0 ? Math.max(...timestamps) : Date.now()
}

function collectLatestMtime(rootPath: string): number {
  try {
    const entries = readdirSync(rootPath, { withFileTypes: true })
    const timestamps = entries.map((entry) => {
      const entryPath = resolve(rootPath, entry.name)

      if (entry.isDirectory()) {
        return collectLatestMtime(entryPath)
      }

      if (entryPath === buildInfoPath) {
        return Number.NEGATIVE_INFINITY
      }

      return getFileMtime(entryPath)
    })

    return timestamps.length > 0 ? Math.max(...timestamps) : Number.NEGATIVE_INFINITY
  } catch {
    return Number.NEGATIVE_INFINITY
  }
}

function getFileMtime(filePath: string) {
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return Number.NEGATIVE_INFINITY
  }
}
