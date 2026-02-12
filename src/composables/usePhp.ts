import { ref, shallowRef } from 'vue'
import { PHP, loadPHPRuntime } from '@php-wasm/universal'
import { getPHPLoaderModule } from '@php-wasm/web-8-4'
import JSZip from 'jszip'

const php = shallowRef<PHP | null>(null)
const booted = ref(false)
const bootProgress = ref(0)
const bootStatus = ref('Loading PHP runtime...')
const vfsVersion = ref(0)

export function usePhp() {
  async function boot() {
    // 1. Boot PHP
    setStatus('Loading PHP 8.4...', 0)
    const loaderModule = await getPHPLoaderModule()
    setStatus('Loading PHP 8.4...', 0.05)
    const runtimeId = await loadPHPRuntime(loaderModule)
    php.value = new PHP(runtimeId)
    setStatus('Loading PHP 8.4...', 0.10)

    // 2. Load Laravel app into virtual filesystem
    setStatus('Downloading Laravel app...', 0.10)
    const res = await fetch('/app.zip')
    const zipData = await res.arrayBuffer()
    const zip = await JSZip.loadAsync(zipData)
    setStatus('Downloading Laravel app...', 0.15)

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
      loaded++
      if (loaded % 50 === 0 || loaded === files.length) {
        setStatus(`Extracting files... (${loaded}/${files.length})`, 0.15 + (loaded / files.length) * 0.70)
      }
    }

    // 3. Bootstrap full Laravel application
    setStatus('Bootstrapping Laravel...', 0.88)
    await php.value!.run({
      code: `<?php
        chdir('/app');
        require '/app/vendor/autoload.php';
        $app = require_once '/app/bootstrap/app.php';
        $kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
        $kernel->bootstrap();
      `,
    })

    // 4. Done
    setStatus('Ready', 1)
    booted.value = true
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
        chdir('/app');
        require '/app/vendor/autoload.php';
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
        chdir('/app');
        require '/app/vendor/autoload.php';
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
    php.value.mkdir(path)
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
    vfsVersion,
    boot,
    navigateTo,
    runArtisan,
    readFile,
    readFileAsBuffer,
    writeFile,
    listFiles,
    fileExists,
    isDir,
    mkdir: mkdirP,
    collectVfsPaths,
  }
}
