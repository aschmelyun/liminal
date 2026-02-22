import { ref, shallowRef } from 'vue'
import { PHP, loadPHPRuntime } from '@php-wasm/universal'
import { getPHPLoaderModule } from '@php-wasm/web-8-4'
import JSZip from 'jszip'
import { fnv1a } from '../utils/hash'

const php = shallowRef<PHP | null>(null)
const booted = ref(false)
const bootProgress = ref(0)
const bootStatus = ref('Loading PHP runtime...')
const vfsVersion = ref(0)
const initialHashes = new Map<string, number>()

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
      initialHashes.set(path, fnv1a(content))
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

  async function dumpAutoload(): Promise<{ output: string; errors: string }> {
    if (!php.value) return { output: '', errors: '' }
    const result = await php.value.run({
      code: `<?php
        chdir('/app');
        require '/app/vendor/autoload.php';
        $app = require_once '/app/bootstrap/app.php';
        $kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
        $kernel->bootstrap();
        $status = Illuminate\\Support\\Facades\\Artisan::call('package:discover');
        echo Illuminate\\Support\\Facades\\Artisan::output();
      `,
    })
    vfsVersion.value++
    return { output: result.text || '', errors: result.errors || '' }
  }

  async function runComposerRequire(packageName: string): Promise<{ output: string; errors: string }> {
    if (!php.value) return { output: '', errors: 'PHP runtime not loaded' }

    const parts = packageName.split('/')
    if (parts.length !== 2) {
      return { output: '', errors: 'Invalid package name. Use vendor/package format.' }
    }
    const [vendor, name] = parts

    try {
      // 1. Fetch package metadata from Packagist
      const metaRes = await fetch(`https://packagist.org/packages/${vendor}/${name}.json`)
      if (!metaRes.ok) {
        return { output: '', errors: `Package "${packageName}" not found on Packagist.` }
      }
      const meta = await metaRes.json()
      const versionsObj = meta.package?.versions ?? {}

      // Pick latest stable version (no dev/alpha/beta/RC)
      const stable = Object.values(versionsObj).find((v: any) => {
        const ver: string = v.version || ''
        return !ver.includes('dev') && !ver.includes('alpha') && !ver.includes('beta') && !ver.includes('RC')
      }) as any
      if (!stable) {
        return { output: '', errors: `No stable version found for "${packageName}".` }
      }

      const version = stable.version
      const distUrl = stable.dist?.url
      if (!distUrl) {
        return { output: '', errors: `No dist URL found for ${packageName}@${version}.` }
      }

      // 2. Download the zip from GitHub archive
      const ref = stable.dist?.reference || 'main'
      const ghMatch = distUrl.match(/github\.com\/([^/]+)\/([^/]+)\//)
      let zipUrl: string
      if (ghMatch) {
        zipUrl = `https://github.com/${ghMatch[1]}/${ghMatch[2]}/archive/refs/heads/${ref}.zip`
      } else {
        zipUrl = distUrl
      }

      const zipRes = await fetch(zipUrl)
      if (!zipRes.ok) {
        return { output: '', errors: `Failed to download package zip (HTTP ${zipRes.status}).` }
      }
      const zipData = await zipRes.arrayBuffer()

      // 3. Extract zip into vendor directory
      const zip = await JSZip.loadAsync(zipData)
      const zipFiles = Object.entries(zip.files).filter(([, f]) => !f.dir)

      // Find the common prefix (most zips have a single root folder)
      const allPaths = zipFiles.map(([p]) => p)
      const firstPath = allPaths[0]
      const prefix = firstPath ? firstPath.split('/')[0] + '/' : ''
      const hasCommonPrefix = prefix && allPaths.every(p => p.startsWith(prefix))

      const vendorBase = `/app/vendor/${vendor}/${name}`
      // Ensure vendor directories exist
      const ensureDir = (dirPath: string) => {
        const segs = dirPath.split('/').filter(Boolean)
        let cur = ''
        for (const seg of segs) {
          cur += '/' + seg
          if (!php.value!.fileExists(cur)) {
            php.value!.mkdir(cur)
          }
        }
      }
      ensureDir(vendorBase)

      let fileCount = 0
      for (const [path, file] of zipFiles) {
        const relativePath = hasCommonPrefix ? path.slice(prefix.length) : path
        if (!relativePath) continue
        const vfsPath = `${vendorBase}/${relativePath}`

        // Ensure parent directories exist
        const parentDir = vfsPath.split('/').slice(0, -1).join('/')
        ensureDir(parentDir)

        const content = await file.async('uint8array')
        php.value!.writeFile(vfsPath, content)
        fileCount++
      }

      // 4. Update composer.json
      const composerJsonPath = '/app/composer.json'
      const composerJson = JSON.parse(php.value.readFileAsText(composerJsonPath))
      if (!composerJson.require) composerJson.require = {}
      composerJson.require[packageName] = `^${version.replace(/^v/, '')}`
      php.value.writeFile(composerJsonPath, JSON.stringify(composerJson, null, 4))

      // 5. Dump autoload
      const autoloadResult = await dumpAutoload()

      vfsVersion.value++

      let output = `Package ${packageName}@${version} installed successfully.\n`
      output += `Extracted ${fileCount} files to vendor/${vendor}/${name}/\n`
      output += `Updated composer.json\n`
      if (autoloadResult.output) {
        output += autoloadResult.output
      }

      return { output, errors: autoloadResult.errors }
    } catch (err: any) {
      return { output: '', errors: err.message || 'Unknown error during composer require.' }
    }
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
    initialHashes,
    boot,
    navigateTo,
    runArtisan,
    runComposerRequire,
    dumpAutoload,
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
