import { ref } from 'vue'
import { usePhp } from './usePhp'
import { fnv1a } from '../utils/hash'

interface SharePayload {
  f: Record<string, string>
  d: string[]
}

const SKIP_DIRS = ['vendor', 'node_modules', '.git']

const sharing = ref(false)
const shareStatus = ref('')
const shareError = ref('')

let pendingEncoded: string | null = null

function captureFromUrl(): boolean {
  const hash = location.hash
  if (hash.startsWith('#s=')) {
    pendingEncoded = hash.slice(3)
    history.replaceState(null, '', location.pathname + location.search)
    return true
  }
  return false
}

function hasPendingPayload(): boolean {
  return pendingEncoded !== null
}

async function applyPendingPayload(): Promise<void> {
  if (!pendingEncoded) return
  const encoded = pendingEncoded
  pendingEncoded = null

  const { writeFile, fileExists, mkdir, vfsVersion } = usePhp()

  try {
    const payload = await decode(encoded)

    for (const [rel, content] of Object.entries(payload.f)) {
      const vfsPath = `/app/${rel}`
      const parts = vfsPath.split('/').slice(1, -1)
      let dir = ''
      for (const part of parts) {
        dir += '/' + part
        if (!fileExists(dir)) mkdir(dir)
      }
      writeFile(vfsPath, content)
    }

    if (payload.d.length > 0) {
      console.warn('[share] Payload includes deleted files, but VFS deletion is not yet supported:', payload.d)
    }

    vfsVersion.value++
  } catch (err: any) {
    console.error('[share] Failed to apply shared payload:', err)
  }
}

async function generateShareUrl(): Promise<void> {
  sharing.value = true
  shareStatus.value = ''
  shareError.value = ''

  try {
    const { collectVfsPaths, readFileAsBuffer, initialHashes } = usePhp()

    const allPaths = collectVfsPaths('/app')
    const payload: SharePayload = { f: {}, d: [] }
    const seenRelPaths = new Set<string>()

    for (const vfsPath of allPaths) {
      const rel = vfsPath.replace(/^\/app\//, '')
      const firstSegment = rel.split('/')[0]!
      if (SKIP_DIRS.includes(firstSegment)) continue

      seenRelPaths.add(rel)
      const content = readFileAsBuffer(vfsPath)

      // Skip binary files (null byte in first 512 bytes)
      const checkLen = Math.min(content.length, 512)
      let isBinary = false
      for (let i = 0; i < checkLen; i++) {
        if (content[i] === 0) { isBinary = true; break }
      }
      if (isBinary) continue

      const hash = fnv1a(content)
      if (initialHashes.get(rel) === hash) continue

      payload.f[rel] = new TextDecoder().decode(content)
    }

    // Detect deletions: files in initialHashes but missing from current VFS
    for (const rel of initialHashes.keys()) {
      const firstSegment = rel.split('/')[0]!
      if (SKIP_DIRS.includes(firstSegment)) continue
      if (!seenRelPaths.has(rel)) {
        payload.d.push(rel)
      }
    }

    if (Object.keys(payload.f).length === 0 && payload.d.length === 0) {
      shareError.value = 'No changes to share.'
      return
    }

    const encoded = await encode(payload)
    const url = `${location.origin}${location.pathname}#s=${encoded}`

    await navigator.clipboard.writeText(url)

    const bytes = new TextEncoder().encode(encoded).length
    shareStatus.value = 'URL copied to clipboard!'
    if (bytes > 8192) {
      shareStatus.value += ' Warning: URL is large and may be too long for some platforms.'
    }
  } catch (err: any) {
    shareError.value = err.message || 'Failed to generate share URL'
  } finally {
    sharing.value = false
  }
}

async function encode(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload)
  const input = new TextEncoder().encode(json)

  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(input)
  writer.close()

  const reader = cs.readable.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const compressed = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    compressed.set(chunk, offset)
    offset += chunk.length
  }

  return base64urlEncode(compressed)
}

async function decode(encoded: string): Promise<SharePayload> {
  const compressed = base64urlDecode(encoded)

  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(compressed as Uint8Array<ArrayBuffer>)
  writer.close()

  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const decompressed = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    decompressed.set(chunk, offset)
    offset += chunk.length
  }

  const json = new TextDecoder().decode(decompressed)
  return JSON.parse(json)
}

function base64urlEncode(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function useShareUrl() {
  return {
    sharing,
    shareStatus,
    shareError,
    captureFromUrl,
    hasPendingPayload,
    applyPendingPayload,
    generateShareUrl,
  }
}
