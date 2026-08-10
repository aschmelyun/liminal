import { ref, shallowRef } from 'vue'
import { PHP, loadPHPRuntime } from '@php-wasm/universal'
import { getPHPLoaderModule } from '@php-wasm/web-8-4'
import JSZip from 'jszip'
import { fnv1a } from '../utils/hash'
import {
  restoreComposerPackages,
  runComposerRequire as composerRequire,
  clearComposerPackageCache,
  type ComposerProgress,
} from './useComposer'

const php = shallowRef<PHP | null>(null)
const booted = ref(false)
const bootProgress = ref(0)
const bootStatus = ref('Loading PHP runtime...')
const vfsVersion = ref(0)
const initialHashes = new Map<string, number>()

// Rolling tail of paths written during boot, surfaced by the loading screen.
const BOOT_LOG_LINES = 11
const bootLog = ref<string[]>([])
let bootLogPending: string[] = []
let bootLogFlushedAt = 0

function logBootPath(path: string) {
  bootLogPending.push(path)
  // Extraction touches thousands of files; repaint on a frame budget instead.
  const now = performance.now()
  if (now - bootLogFlushedAt < 60) return
  bootLogFlushedAt = now
  bootLog.value = [...bootLog.value, ...bootLogPending].slice(-BOOT_LOG_LINES)
  bootLogPending = []
}

// Git-ignored Laravel runtime directories are empty, so app.zip carries no
// entries for them. Recreate them in MEMFS before Composer or Laravel boots.
const LARAVEL_RUNTIME_DIRS = [
  '/app/bootstrap/cache',
  '/app/storage/app/private',
  '/app/storage/app/public',
  '/app/storage/framework/cache/data',
  '/app/storage/framework/sessions',
  '/app/storage/framework/testing',
  '/app/storage/framework/views',
  '/app/storage/logs',
]

// Every entry point requires Composer's autoloader plus the supplemental one
// generated for dynamically installed packages.
export const PREAMBLE = `
  chdir('/app');
  require '/app/vendor/autoload.php';
  if (file_exists('/app/.liminal/autoload.php')) require '/app/.liminal/autoload.php';
`

function ensureDirectory(runtime: PHP, path: string): void {
  const segments = path.split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current += `/${segment}`
    if (!runtime.fileExists(current)) runtime.mkdir(current)
  }
}

export function usePhp() {
  function composerRuntime() {
    return {
      php: php.value!,
      preamble: PREAMBLE,
      changed: () => { vfsVersion.value++ },
    }
  }

  async function boot() {
    // 1. Boot PHP
    setStatus('Loading PHP 8.4 runtime', 0)
    logBootPath('php-8.4.wasm')
    const loaderModule = await getPHPLoaderModule()
    setStatus('Loading PHP 8.4 runtime', 0.05)
    const runtimeId = await loadPHPRuntime(loaderModule)
    php.value = new PHP(runtimeId)
    setStatus('Loading PHP 8.4 runtime', 0.10)

    // 2. Load Laravel app into virtual filesystem
    setStatus('Downloading project archive', 0.10)
    logBootPath('app.zip')
    const res = await fetch('/app.zip')
    const zipData = await res.arrayBuffer()
    const zip = await JSZip.loadAsync(zipData)
    setStatus('Downloading project archive', 0.15)

    const files = Object.entries(zip.files).filter(([, f]) => !f.dir)
    let loaded = 0
    for (const [path, file] of files) {
      const content = await file.async('uint8array')
      const vfsPath = `/app/${path}`

      const parts = vfsPath.split('/').slice(1, -1)
      let dir = ''
      for (const part of parts) {
        dir += '/' + part
        if (!php.value!.fileExists(dir)) {
          php.value!.mkdir(dir)
        }
      }

      php.value!.writeFile(vfsPath, content)
      initialHashes.set(path, fnv1a(content))
      logBootPath(path)
      loaded++
      if (loaded % 50 === 0 || loaded === files.length) {
        setStatus(`Extracting project files — ${loaded}/${files.length}`, 0.15 + (loaded / files.length) * 0.70)
      }
    }

    for (const directory of LARAVEL_RUNTIME_DIRS) {
      ensureDirectory(php.value!, directory)
    }

    const composerRuntimeFiles = [
      '/app/.liminal/resolve.php',
      '/app/.liminal/classmap.php',
      '/app/.liminal/generate.php',
      '/app/vendor/composer/semver/src/Semver.php',
    ]
    for (const requiredFile of composerRuntimeFiles) {
      if (!php.value!.fileExists(requiredFile)) {
        throw new Error(`Embedded Composer runtime file is missing: ${requiredFile}`)
      }
    }

    // 3. Restore dynamically installed Composer packages from IndexedDB
    setStatus('Restoring Composer packages', 0.86)
    await restoreComposerPackages(composerRuntime(), (line) => {
      setStatus(line, 0.90)
      logBootPath(line)
    })

    // 4. Bootstrap full Laravel application
    setStatus('Bootstrapping Laravel', 0.95)
    logBootPath('bootstrap/app.php')
    await php.value!.run({
      code: `<?php
        ${PREAMBLE}
        $app = require_once '/app/bootstrap/app.php';
        $kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
        $kernel->bootstrap();
      `,
    })

    // 5. Done
    setStatus('Ready', 1)
    booted.value = true
  }

  async function query<T = any>(code: string): Promise<T> {
    if (!php.value) throw new Error('PHP runtime is not running')
    const result = await php.value.run({ code })
    const text = (result.text || '').trim()
    if (!text) throw new Error(result.errors?.trim() || 'PHP returned no output')
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(text)
    }
  }

  function setStatus(text: string, progress?: number) {
    bootStatus.value = text
    if (progress !== undefined) {
      bootProgress.value = progress
    }
  }

  async function navigateTo(path: string): Promise<string> {
    if (!php.value) return ''
    const safePath = path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const result = await php.value.run({
      code: `<?php
        ${PREAMBLE}
        $app = require_once '/app/bootstrap/app.php';
        $request = Illuminate\\Http\\Request::create('${safePath}', 'GET');
        $kernel = $app->make(Illuminate\\Contracts\\Http\\Kernel::class);
        $response = $kernel->handle($request);
        echo $response->getContent();
      `,
    })
    return result.text || ''
  }

  async function runArtisan(command: string): Promise<{ output: string; errors: string }> {
    if (!php.value) return { output: '', errors: '' }
    const safeCmd = command.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const result = await php.value.run({
      code: `<?php
        ${PREAMBLE}
        $app = require_once '/app/bootstrap/app.php';
        $kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
        $kernel->bootstrap();
        $status = Illuminate\\Support\\Facades\\Artisan::call('${safeCmd}');
        echo Illuminate\\Support\\Facades\\Artisan::output();
      `,
    })
    vfsVersion.value++
    return { output: result.text || '', errors: result.errors || '' }
  }

  function readFile(vfsPath: string): string {
    if (!php.value) return ''
    return php.value.readFileAsText(vfsPath)
  }

  function readFileAsBuffer(vfsPath: string): Uint8Array {
    if (!php.value) return new Uint8Array()
    return php.value.readFileAsBuffer(vfsPath)
  }

  function writeFile(vfsPath: string, content: string | Uint8Array): void {
    if (!php.value) return
    php.value.writeFile(vfsPath, content)
    vfsVersion.value++
  }

  function listFiles(dir: string): string[] {
    if (!php.value) return []
    return php.value.listFiles(dir)
  }

  function fileExists(path: string): boolean {
    if (!php.value) return false
    return php.value.fileExists(path)
  }

  function isDir(path: string): boolean {
    if (!php.value) return false
    return php.value.isDir(path)
  }

  function mkdirP(path: string): void {
    if (!php.value) return
    ensureDirectory(php.value, path)
  }

  async function runComposerRequire(
    packageName: string,
    progress?: ComposerProgress,
  ): Promise<{ output: string; errors: string }> {
    if (!php.value) return { output: '', errors: 'PHP runtime not loaded' }
    return composerRequire(composerRuntime(), packageName, progress)
  }

  /** Signal that PHP mutated the filesystem behind our back (e.g. a SQL write). */
  function touchVfs(): void {
    vfsVersion.value++
  }

  function collectVfsPaths(dir = '/app'): string[] {
    const paths: string[] = []
    try {
      const entries = listFiles(dir)
      for (const name of entries) {
        const full = `${dir}/${name}`
        if (isDir(full)) {
          paths.push(...collectVfsPaths(full))
        } else {
          paths.push(full)
        }
      }
    } catch (_) { /* skip unreadable dirs */ }
    return paths
  }

  return {
    php,
    booted,
    bootProgress,
    bootStatus,
    bootLog,
    vfsVersion,
    initialHashes,
    boot,
    query,
    navigateTo,
    runArtisan,
    runComposerRequire,
    clearComposerPackageCache,
    readFile,
    readFileAsBuffer,
    writeFile,
    listFiles,
    fileExists,
    isDir,
    mkdir: mkdirP,
    touchVfs,
    collectVfsPaths,
  }
}
