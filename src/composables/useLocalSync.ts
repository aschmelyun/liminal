import { ref, watch } from 'vue'
import { usePhp } from './usePhp'

type SyncState = 'disconnected' | 'syncing-initial' | 'connected' | 'error'

const SKIP_DIRS = ['vendor', 'node_modules', '.git']
const POLL_INTERVAL = 2000
const VFS_DEBOUNCE = 500

const syncState = ref<SyncState>('disconnected')
const syncStatus = ref('')
const syncError = ref('')
const syncProgress = ref(0)

let directoryHandle: FileSystemDirectoryHandle | null = null
let pollIntervalId: ReturnType<typeof setInterval> | null = null
let vfsWatcherStop: (() => void) | null = null
let syncLock = false

const vfsSnapshot = new Map<string, number>()
const localSnapshot = new Map<string, number>()

const isSupported = typeof window.showDirectoryPicker === 'function'

// FNV-1a hash — fast, good distribution for change detection
function fnv1a(data: Uint8Array): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i]!
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function shouldSkip(relativePath: string): boolean {
  const first = relativePath.split('/')[0]!
  return SKIP_DIRS.includes(first)
}

async function getNestedDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true })
  }
  return dir
}

async function writeLocalFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  content: Uint8Array,
): Promise<void> {
  const parts = relativePath.split('/')
  const fileName = parts.pop()!
  const dir = await getNestedDir(root, parts)
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content as Uint8Array<ArrayBuffer>)
  await writable.close()
}

async function readLocalFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<{ content: Uint8Array; lastModified: number }> {
  const parts = relativePath.split('/')
  const fileName = parts.pop()!
  let dir = root
  for (const seg of parts) {
    dir = await dir.getDirectoryHandle(seg)
  }
  const fileHandle = await dir.getFileHandle(fileName)
  const file = await fileHandle.getFile()
  const buffer = await file.arrayBuffer()
  return { content: new Uint8Array(buffer), lastModified: file.lastModified }
}

async function collectLocalPaths(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<{ path: string; lastModified: number }[]> {
  const results: { path: string; lastModified: number }[] = []
  for await (const [name, handle] of dir.entries()) {
    const rel = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      if (SKIP_DIRS.includes(name)) continue
      results.push(...(await collectLocalPaths(handle as FileSystemDirectoryHandle, rel)))
    } else {
      const file = await (handle as FileSystemFileHandle).getFile()
      results.push({ path: rel, lastModified: file.lastModified })
    }
  }
  return results
}

async function removeLocalEntry(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<void> {
  const parts = relativePath.split('/')
  const name = parts.pop()!
  let dir = root
  for (const seg of parts) {
    try {
      dir = await dir.getDirectoryHandle(seg)
    } catch {
      return // parent doesn't exist, nothing to remove
    }
  }
  try {
    await dir.removeEntry(name, { recursive: true })
  } catch {
    // already gone
  }
}

async function initialSync(): Promise<void> {
  const { collectVfsPaths, readFileAsBuffer, writeFile, fileExists, mkdir } = usePhp()

  syncState.value = 'syncing-initial'
  syncStatus.value = 'Scanning local folder...'
  syncProgress.value = 0

  // Collect both sides
  const localFiles = await collectLocalPaths(directoryHandle!)
  const vfsPaths = collectVfsPaths('/app')
    .map((p) => p.replace(/^\/app\//, ''))
    .filter((p) => !shouldSkip(p))

  const localFiltered = localFiles.filter((f) => !shouldSkip(f.path))
  const localPathSet = new Set(localFiltered.map((f) => f.path))

  const total = localFiltered.length + vfsPaths.filter((p) => !localPathSet.has(p)).length
  let done = 0

  // Phase 1: Local → VFS (local files win for any overlap)
  syncStatus.value = 'Importing local files...'
  for (const { path: rel, lastModified } of localFiltered) {
    try {
      const { content } = await readLocalFile(directoryHandle!, rel)
      const hash = fnv1a(content)

      // Write local file into VFS
      const vfsPath = `/app/${rel}`
      const parts = vfsPath.split('/').slice(1, -1)
      let dir = ''
      for (const part of parts) {
        dir += '/' + part
        if (!fileExists(dir)) mkdir(dir)
      }
      writeFile(vfsPath, content)

      vfsSnapshot.set(rel, hash)
      localSnapshot.set(rel, lastModified)
    } catch (err) {
      console.warn(`[local-sync] Failed to import ${rel}:`, err)
    }

    done++
    if (done % 20 === 0 || done === total) {
      syncProgress.value = done / total
      syncStatus.value = `Importing local files... (${done}/${total})`
    }
  }

  // Phase 2: VFS → Local (only files that don't exist locally)
  syncStatus.value = 'Downloading remaining files...'
  for (const rel of vfsPaths) {
    if (localPathSet.has(rel)) continue // already handled — local version won

    try {
      const content = readFileAsBuffer(`/app/${rel}`)
      await writeLocalFile(directoryHandle!, rel, content)

      const hash = fnv1a(content)
      vfsSnapshot.set(rel, hash)

      const { lastModified } = await readLocalFile(directoryHandle!, rel)
      localSnapshot.set(rel, lastModified)
    } catch (err) {
      console.warn(`[local-sync] Failed to write ${rel}:`, err)
    }

    done++
    if (done % 20 === 0 || done === total) {
      syncProgress.value = done / total
      syncStatus.value = `Downloading remaining files... (${done}/${total})`
    }
  }

  syncStatus.value = `Synced ${done} files`
  syncProgress.value = 1
}

function startVfsWatcher(): void {
  const { vfsVersion, collectVfsPaths, readFileAsBuffer } = usePhp()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const stopWatch = watch(vfsVersion, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => pushVfsToLocal(), VFS_DEBOUNCE)
  })

  async function pushVfsToLocal(): Promise<void> {
    if (syncLock || !directoryHandle) return
    syncLock = true

    try {
      const allPaths = collectVfsPaths('/app')
      const currentFiles = new Set<string>()

      for (const vfsPath of allPaths) {
        const rel = vfsPath.replace(/^\/app\//, '')
        if (shouldSkip(rel)) continue
        currentFiles.add(rel)

        try {
          const content = readFileAsBuffer(vfsPath)
          const hash = fnv1a(content)

          if (vfsSnapshot.get(rel) === hash) continue // unchanged

          await writeLocalFile(directoryHandle!, rel, content)
          vfsSnapshot.set(rel, hash)

          const { lastModified } = await readLocalFile(directoryHandle!, rel)
          localSnapshot.set(rel, lastModified)
        } catch (err) {
          console.warn(`[local-sync] VFS→local failed for ${rel}:`, err)
        }
      }

      // Detect VFS deletions
      for (const rel of vfsSnapshot.keys()) {
        if (!currentFiles.has(rel)) {
          try {
            await removeLocalEntry(directoryHandle!, rel)
          } catch {
            // ignore
          }
          vfsSnapshot.delete(rel)
          localSnapshot.delete(rel)
        }
      }
    } catch (err: any) {
      handleFsError(err)
    } finally {
      syncLock = false
    }
  }

  vfsWatcherStop = () => {
    stopWatch()
    if (debounceTimer) clearTimeout(debounceTimer)
  }
}

function startLocalPoller(): void {
  const { readFileAsBuffer, writeFile, fileExists, mkdir } = usePhp()

  pollIntervalId = setInterval(async () => {
    if (syncLock || !directoryHandle) return
    syncLock = true

    try {
      const localFiles = await collectLocalPaths(directoryHandle!)
      const seen = new Set<string>()

      for (const { path: rel, lastModified } of localFiles) {
        if (shouldSkip(rel)) continue
        seen.add(rel)

        const prevModified = localSnapshot.get(rel)
        if (prevModified !== undefined && lastModified === prevModified) continue

        // File is new or modified locally
        try {
          const { content } = await readLocalFile(directoryHandle!, rel)
          const hash = fnv1a(content)

          // Echo prevention: if the content hash matches what we know the VFS has, skip
          if (vfsSnapshot.get(rel) === hash) {
            localSnapshot.set(rel, lastModified)
            continue
          }

          // Write to VFS
          const vfsPath = `/app/${rel}`
          const parts = vfsPath.split('/').slice(1, -1)
          let dir = ''
          for (const part of parts) {
            dir += '/' + part
            if (!fileExists(dir)) {
              mkdir(dir)
            }
          }

          writeFile(vfsPath, content)
          vfsSnapshot.set(rel, hash)
          localSnapshot.set(rel, lastModified)
        } catch (err) {
          console.warn(`[local-sync] local→VFS failed for ${rel}:`, err)
        }
      }

      // No local→VFS deletion sync for v1
    } catch (err: any) {
      handleFsError(err)
    } finally {
      syncLock = false
    }
  }, POLL_INTERVAL)
}

function handleFsError(err: any): void {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
    syncState.value = 'error'
    syncError.value = 'Permission to access the folder was revoked.'
    cleanupWatchers()
  }
}

function cleanupWatchers(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
  if (vfsWatcherStop) {
    vfsWatcherStop()
    vfsWatcherStop = null
  }
}

async function connect(): Promise<void> {
  if (!isSupported) return

  try {
    directoryHandle = await window.showDirectoryPicker!({
      id: 'liminal-sync',
      mode: 'readwrite',
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') return // user cancelled
    syncState.value = 'error'
    syncError.value = err?.message || 'Failed to open directory'
    return
  }

  syncError.value = ''

  try {
    await initialSync()
  } catch (err: any) {
    syncState.value = 'error'
    syncError.value = err?.message || 'Initial sync failed'
    directoryHandle = null
    return
  }

  startVfsWatcher()
  startLocalPoller()
  syncState.value = 'connected'
  syncStatus.value = `Mirroring to ${directoryHandle.name}/`
}

function disconnect(): void {
  cleanupWatchers()
  directoryHandle = null
  vfsSnapshot.clear()
  localSnapshot.clear()
  syncLock = false
  syncState.value = 'disconnected'
  syncStatus.value = ''
  syncError.value = ''
  syncProgress.value = 0
}

export function useLocalSync() {
  return {
    syncState,
    syncStatus,
    syncError,
    syncProgress,
    isSupported,
    connect,
    disconnect,
  }
}
