// FNV-1a hash — fast, good distribution for change detection
export function fnv1a(data: Uint8Array): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i]!
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
