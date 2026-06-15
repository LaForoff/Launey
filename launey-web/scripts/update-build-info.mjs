import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const buildInfoPath = resolve('src/config/buildInfo.ts')
const projectRoots = [
  resolve('src'),
  resolve('scripts'),
  resolve('vite.plugins'),
]
const projectFiles = [
  resolve('package.json'),
  resolve('vite.config.ts'),
  resolve('tsconfig.json'),
  resolve('tsconfig.app.json'),
  resolve('tsconfig.node.json'),
]

const nextTimestamp = (await getLatestProjectEditAt()).toISOString()

const source = await readFile(buildInfoPath, 'utf8')
const updated = source.replace(
  /lastUpdatedAt:\s*'[^']*'/,
  `lastUpdatedAt: '${nextTimestamp}'`,
)

if (source === updated) {
  process.exit(0)
}

await writeFile(buildInfoPath, updated)

async function getLatestProjectEditAt() {
  const timestamps = await Promise.all([
    ...projectRoots.map((root) => collectLatestMtime(root)),
    ...projectFiles.map((filePath) => getFileMtime(filePath)),
  ])

  const latestTimestamp = Math.max(...timestamps.filter((value) => Number.isFinite(value)))
  return Number.isFinite(latestTimestamp) ? new Date(latestTimestamp) : new Date()
}

async function collectLatestMtime(rootPath) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true })
    const timestamps = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = resolve(rootPath, entry.name)

        if (entry.isDirectory()) {
          return collectLatestMtime(entryPath)
        }

        if (entryPath === buildInfoPath) {
          return Number.NEGATIVE_INFINITY
        }

        return getFileMtime(entryPath)
      }),
    )

    return Math.max(...timestamps, Number.NEGATIVE_INFINITY)
  } catch {
    return Number.NEGATIVE_INFINITY
  }
}

async function getFileMtime(filePath) {
  try {
    const fileStat = await stat(filePath)
    return fileStat.mtimeMs
  } catch {
    return Number.NEGATIVE_INFINITY
  }
}
