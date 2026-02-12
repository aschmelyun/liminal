/// <reference types="vite/client" />

// File System Access API
// https://wicg.github.io/file-system-access/
interface FileSystemWritableFileStream {
  write(data: BufferSource | Blob | string): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface FileSystemDirectoryHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string
  }): Promise<FileSystemDirectoryHandle>
}

declare module '@php-wasm/universal' {
  export class PHP {
    constructor(runtimeId: number)
    run(options: { code: string }): Promise<{ text: string; errors: string }>
    readFileAsText(path: string): string
    readFileAsBuffer(path: string): Uint8Array
    writeFile(path: string, content: string | Uint8Array): void
    listFiles(dir: string): string[]
    fileExists(path: string): boolean
    isDir(path: string): boolean
    mkdir(path: string): void
  }
  export function loadPHPRuntime(loaderModule: any): Promise<number>
}

declare module '@php-wasm/web-8-4' {
  export function getPHPLoaderModule(): Promise<any>
}

declare module '@php-wasm/web' {
  // re-export types if needed
}
