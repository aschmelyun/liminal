// setImmediate polyfill — required by @php-wasm
if (!('setImmediate' in globalThis)) {
  ;(globalThis as any).setImmediate = (fn: (...args: any[]) => void) => setTimeout(fn, 0)
}

// WASM chunk fetch interceptor — reassembles split .wasm files from a .wasm.json manifest.
// Must run before any WASM fetch (i.e. before PHP boot).
const _origFetch = globalThis.fetch
globalThis.fetch = async function (url: RequestInfo | URL, opts?: RequestInit) {
  if (!String(url).endsWith('.wasm')) return _origFetch(url, opts)

  const manifestUrl = String(url).replace('.wasm', '.wasm.json')
  const manifestRes = await _origFetch(manifestUrl)
  if (!manifestRes.ok) return _origFetch(url, opts)

  const { chunks } = await manifestRes.json()
  const baseUrl = String(url).substring(0, String(url).lastIndexOf('/') + 1)
  const parts: ArrayBuffer[] = await Promise.all(
    chunks.map((c: string) => _origFetch(baseUrl + c).then((r: Response) => r.arrayBuffer()))
  )
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    merged.set(new Uint8Array(part), offset)
    offset += part.byteLength
  }
  return new Response(merged, {
    status: 200,
    headers: { 'Content-Type': 'application/wasm' },
  })
} as typeof fetch

import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')
