import type { PHP } from '@php-wasm/universal'
import JSZip from 'jszip'

export interface ComposerLockEntry {
  version: string
  normalizedVersion: string
  distUrl: string
  reference: string | null
}

export type ComposerLock = Record<string, ComposerLockEntry>
export type ComposerProgress = (line: string) => void

interface ComposerRuntime {
  php: PHP
  preamble: string
  changed(): void
}

interface PackageCandidate {
  name?: string
  version: string
  version_normalized?: string
  require?: Record<string, string>
  conflict?: Record<string, string>
  dist?: {
    url?: string
    reference?: string
  }
}

interface SelectedPackage {
  name: string
  candidate: PackageCandidate
  normalizedVersion: string
  dependencies: string[]
}

interface ConstraintSource {
  constraint: string
  requestedBy: string
  depth: number
}

interface ResolveJobResult {
  chosen: PackageCandidate | null
  normalized: string | null
}

const DB_NAME = 'liminal-composer'
const STORE_NAME = 'packages'
const LOCK_KEY = 'liminal:lock'
const MAX_DEPTH = 20
const MAX_PACKAGES = 150
const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024
const metadataCache = new Map<string, PackageCandidate[]>()

function ensureDir(php: PHP, path: string): void {
  const segments = path.split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current += `/${segment}`
    if (!php.fileExists(current)) php.mkdir(current)
  }
}

async function openDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open package cache'))
  })
}

async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error ?? new Error(`Could not read cache key ${key}`))
    })
  } finally {
    database.close()
  }
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(value, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error(`Could not write cache key ${key}`))
    })
  } finally {
    database.close()
  }
}

async function runJob<T>(
  runtime: ComposerRuntime,
  job: 'resolve.php' | 'generate.php',
  input: unknown,
): Promise<T> {
  ensureDir(runtime.php, '/app/.liminal/tmp')
  runtime.php.writeFile('/app/.liminal/tmp/in.json', JSON.stringify(input))
  const result = await runtime.php.run({
    code: `<?php
      ${runtime.preamble}
      require '/app/.liminal/${job}';
    `,
  })

  if (!result.text?.trim()) {
    throw new Error(result.errors?.trim() || `${job} returned no result`)
  }

  try {
    return JSON.parse(result.text) as T
  } catch {
    throw new Error(`${job} returned invalid JSON: ${result.text}${result.errors ? `\n${result.errors}` : ''}`)
  }
}

function parseRequest(input: string): { name: string; constraint: string; explicitConstraint: boolean } {
  const match = input.trim().match(
    /^([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)(?::(.+))?$/i,
  )
  if (!match) {
    throw new Error('Invalid package requirement. Use vendor/package or vendor/package:^3.0.')
  }
  return {
    name: match[1]!.toLowerCase(),
    constraint: match[2]?.trim() || '*',
    explicitConstraint: Boolean(match[2]?.trim()),
  }
}

function isPlatformRequirement(name: string): boolean {
  return name === 'php'
    || name === 'php-64bit'
    || name === 'hhvm'
    || name.startsWith('ext-')
    || name.startsWith('lib-')
    || name.startsWith('composer-')
}

function wantsDevelopmentVersion(constraints: string[]): boolean {
  return constraints.some((constraint) =>
    /(^|[|,\s])(dev-[\w.-]+|[\w.-]+\.x-dev)(?=$|[|,\s])|@dev/i.test(constraint),
  )
}

function expandMinifiedVersions(versions: Record<string, any>[]): PackageCandidate[] {
  let expanded: Record<string, any> = {}
  const result: PackageCandidate[] = []

  for (const [index, version] of versions.entries()) {
    if (index === 0) {
      expanded = { ...version }
    } else {
      const next = { ...expanded }
      for (const [key, value] of Object.entries(version)) {
        if (value === '__unset') delete next[key]
        else next[key] = value
      }
      expanded = next
    }
    result.push({ ...expanded } as PackageCandidate)
  }

  return result
}

async function fetchCandidates(name: string, includeDev: boolean): Promise<PackageCandidate[]> {
  const cacheKey = `${name}:${includeDev ? 'dev' : 'stable'}`
  const cached = metadataCache.get(cacheKey)
  if (cached) return cached

  const upstreamUrls = [`https://repo.packagist.org/p2/${name}.json`]
  if (includeDev) upstreamUrls.push(`https://repo.packagist.org/p2/${name}~dev.json`)

  const candidates: PackageCandidate[] = []
  for (const upstreamUrl of upstreamUrls) {
    const response = await fetch(`/api/dist?url=${encodeURIComponent(upstreamUrl)}`)
    if (response.status === 404) continue
    if (!response.ok) throw new Error(`Packagist returned HTTP ${response.status} for ${name}.`)
    const metadata = await response.json()
    const versions = metadata.packages?.[name] ?? []
    candidates.push(...(
      metadata.minified === 'composer/2.0'
        ? expandMinifiedVersions(versions)
        : versions
    ))
  }

  const unique = Array.from(
    new Map(candidates.map((candidate) => [candidate.version, candidate])).values(),
  )
  metadataCache.set(cacheKey, unique)
  return unique
}

async function installedVersions(runtime: ComposerRuntime): Promise<Record<string, string>> {
  const path = '/app/vendor/composer/installed.json'
  if (!runtime.php.fileExists(path)) return {}
  const document = JSON.parse(runtime.php.readFileAsText(path))
  const packages = document.packages ?? document
  return Object.fromEntries(
    packages
      .filter((item: any) => item.name && item.version)
      .map((item: any) => [String(item.name).toLowerCase(), String(item.version)]),
  )
}

async function satisfies(
  runtime: ComposerRuntime,
  version: string,
  constraints: string[],
): Promise<boolean> {
  const result = await runJob<ResolveJobResult>(runtime, 'resolve.php', {
    candidates: [{ version }],
    constraints,
    stability: 'dev',
  })
  return result.chosen !== null
}

function conflictError(name: string, version: string, sources: ConstraintSource[]): Error {
  const requirements = sources
    .map(({ constraint, requestedBy }) => `${requestedBy} requires ${name} ${constraint}`)
    .join('; ')
  return new Error(
    `Your requirements could not be resolved.\n  - ${name} is fixed at ${version}, but ${requirements}.`,
  )
}

async function resolveDependencies(
  runtime: ComposerRuntime,
  rootName: string,
  rootConstraint: string,
  progress: ComposerProgress,
): Promise<SelectedPackage[]> {
  const installed = await installedVersions(runtime)
  const selected = new Map<string, SelectedPackage>()
  const requirements = new Map<string, ConstraintSource[]>()
  const queue: string[] = []
  const queued = new Set<string>()

  const enqueue = (name: string, source: ConstraintSource) => {
    name = name.toLowerCase()
    if (isPlatformRequirement(name)) return
    if (source.depth > MAX_DEPTH) {
      throw new Error(`Dependency graph exceeded the maximum depth of ${MAX_DEPTH} at ${name}.`)
    }
    const existing = requirements.get(name) ?? []
    if (!existing.some((item) =>
      item.constraint === source.constraint && item.requestedBy === source.requestedBy
    )) {
      existing.push(source)
      requirements.set(name, existing)
      if (!queued.has(name)) {
        queue.push(name)
        queued.add(name)
      }
    }
  }

  enqueue(rootName, { constraint: rootConstraint, requestedBy: 'root project', depth: 0 })

  while (queue.length > 0) {
    const name = queue.shift()!
    queued.delete(name)
    const sources = requirements.get(name)!
    const constraints = sources.map((source) => source.constraint)

    if (installed[name]) {
      if (!await satisfies(runtime, installed[name]!, constraints)) {
        throw conflictError(name, installed[name]!, sources)
      }
      continue
    }

    const alreadySelected = selected.get(name)
    if (alreadySelected) {
      if (!await satisfies(runtime, alreadySelected.candidate.version, constraints)) {
        throw conflictError(name, alreadySelected.candidate.version, sources)
      }
      continue
    }

    if (selected.size >= MAX_PACKAGES) {
      throw new Error(`Dependency graph exceeded the maximum of ${MAX_PACKAGES} packages.`)
    }

    progress(`Resolving ${name} (${constraints.join(', ')})`)
    const candidates = await fetchCandidates(name, wantsDevelopmentVersion(constraints))
    if (candidates.length === 0) {
      throw new Error(`Package "${name}" was not found on Packagist.`)
    }

    const resolution = await runJob<ResolveJobResult>(runtime, 'resolve.php', {
      candidates,
      constraints,
      stability: wantsDevelopmentVersion(constraints) ? 'dev' : 'stable',
    })
    if (!resolution.chosen || !resolution.normalized) {
      throw new Error(
        `Your requirements could not be resolved.\n  - No version of ${name} matches ${constraints.join(' and ')}.`,
      )
    }

    const dependencyNames: string[] = []
    const selectedPackage: SelectedPackage = {
      name,
      candidate: resolution.chosen,
      normalizedVersion: resolution.normalized,
      dependencies: dependencyNames,
    }
    selected.set(name, selectedPackage)

    for (const [dependencyName, constraint] of Object.entries(resolution.chosen.require ?? {})) {
      if (isPlatformRequirement(dependencyName.toLowerCase())) continue
      dependencyNames.push(dependencyName.toLowerCase())
      enqueue(dependencyName, {
        constraint,
        requestedBy: `${name} ${resolution.chosen.version}`,
        depth: Math.min(...sources.map((source) => source.depth)) + 1,
      })
    }

    for (const [conflictingName, constraint] of Object.entries(resolution.chosen.conflict ?? {})) {
      progress(`Warning: ${name} declares a conflict with ${conflictingName} ${constraint}; conflicts are not solved in this PoC.`)
    }
  }

  // Composer initializes dependency autoload files before the packages that
  // depend on them. Preserve that useful ordering in the lock and generator.
  const ordered: SelectedPackage[] = []
  const visited = new Set<string>()
  const visit = (item: SelectedPackage) => {
    if (visited.has(item.name)) return
    visited.add(item.name)
    for (const dependency of item.dependencies) {
      const selectedDependency = selected.get(dependency)
      if (selectedDependency) visit(selectedDependency)
    }
    ordered.push(item)
  }
  for (const item of selected.values()) visit(item)
  return ordered
}

function shouldSkipArchivePath(path: string): boolean {
  const segments = path.split('/').filter(Boolean)
  const first = segments[0]?.toLowerCase()
  return first === 'tests'
    || first === 'test'
    || first === 'docs'
    || first === 'doc'
    || first === '.github'
    || path.toLowerCase().endsWith('.md')
}

async function extractPackage(
  runtime: ComposerRuntime,
  name: string,
  archive: ArrayBuffer,
): Promise<number> {
  const zip = await JSZip.loadAsync(archive)
  const entries = Object.entries(zip.files).filter(([, file]) => !file.dir)
  const paths = entries.map(([path]) => path)
  const firstSegment = paths[0]?.split('/')[0]
  const prefix = firstSegment && paths.every((path) => path.startsWith(`${firstSegment}/`))
    ? `${firstSegment}/`
    : ''
  const base = `/app/vendor/${name}`
  ensureDir(runtime.php, base)

  let fileCount = 0
  let extractedBytes = 0
  for (const [archivePath, file] of entries) {
    const relativePath = prefix ? archivePath.slice(prefix.length) : archivePath
    if (!relativePath || shouldSkipArchivePath(relativePath)) continue

    const content = await file.async('uint8array')
    extractedBytes += content.byteLength
    if (extractedBytes > MAX_EXTRACTED_BYTES) {
      throw new Error(`${name} expands beyond the ${MAX_EXTRACTED_BYTES / 1024 / 1024} MB safety limit.`)
    }

    const destination = `${base}/${relativePath}`
    ensureDir(runtime.php, destination.split('/').slice(0, -1).join('/'))
    runtime.php.writeFile(destination, content)
    fileCount++
  }
  return fileCount
}

async function generateRuntimeFiles(runtime: ComposerRuntime, lock: ComposerLock): Promise<void> {
  await runJob(runtime, 'generate.php', { packages: lock })
}

async function discoverPackages(runtime: ComposerRuntime): Promise<{ output: string; errors: string }> {
  const result = await runtime.php.run({
    code: `<?php
      chdir('/app');
      foreach (glob('/app/bootstrap/cache/*.php') ?: [] as $cacheFile) {
        @unlink($cacheFile);
      }
      ${runtime.preamble}
      $app = require '/app/bootstrap/app.php';
      $kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
      $kernel->bootstrap();
      Illuminate\\Support\\Facades\\Artisan::call('package:discover', ['--ansi' => false]);
      echo Illuminate\\Support\\Facades\\Artisan::output();
    `,
  })
  return { output: result.text || '', errors: result.errors || '' }
}

async function readLock(): Promise<ComposerLock> {
  try {
    return await cacheGet<ComposerLock>(LOCK_KEY) ?? {}
  } catch (error) {
    console.warn('[composer] Package persistence is unavailable:', error)
    return {}
  }
}

async function writeLock(lock: ComposerLock): Promise<void> {
  try {
    await cacheSet(LOCK_KEY, lock)
  } catch (error) {
    console.warn('[composer] Could not persist package lock:', error)
  }
}

function updateRootRequirement(
  runtime: ComposerRuntime,
  name: string,
  requestedConstraint: string,
  explicitConstraint: boolean,
  selectedVersion: string,
): void {
  const composerPath = '/app/composer.json'
  const composer = JSON.parse(runtime.php.readFileAsText(composerPath))
  composer.require ??= {}
  composer.require[name] = explicitConstraint
    ? requestedConstraint
    : selectedVersion.match(/^v?\d+(?:\.\d+){0,2}/)
      ? `^${selectedVersion.replace(/^v/, '')}`
      : selectedVersion
  runtime.php.writeFile(composerPath, `${JSON.stringify(composer, null, 4)}\n`)
}

export async function restoreComposerPackages(
  runtime: ComposerRuntime,
  progress: ComposerProgress = () => {},
): Promise<number> {
  const lock = await readLock()
  const entries = Object.entries(lock)
  if (entries.length === 0) return 0

  let restored = 0
  const restoredLock: ComposerLock = {}
  for (const [name, entry] of entries) {
    const archive = await cacheGet<ArrayBuffer>(`zip:${name}@${entry.version}`)
    if (!archive) {
      console.warn(`[composer] Missing cached archive for ${name}@${entry.version}; skipping restore.`)
      continue
    }
    progress(`Restoring ${name} (${entry.version})`)
    await extractPackage(runtime, name, archive)
    restoredLock[name] = entry
    restored++
  }

  if (restored > 0) {
    await generateRuntimeFiles(runtime, restoredLock)
    const discovery = await discoverPackages(runtime)
    if (discovery.errors.trim()) console.warn('[composer] Package discovery warnings:', discovery.errors)
    runtime.changed()
  }
  if (restored !== entries.length) await writeLock(restoredLock)
  return restored
}

export async function runComposerRequire(
  runtime: ComposerRuntime,
  input: string,
  progress: ComposerProgress = () => {},
): Promise<{ output: string; errors: string }> {
  try {
    const request = parseRequest(input)
    progress('Resolving dependencies...')
    const resolved = await resolveDependencies(
      runtime,
      request.name,
      request.constraint,
      progress,
    )

    const previousLock = await readLock()
    const installed = await installedVersions(runtime)
    const toInstall = resolved.filter(({ name }) => !installed[name] && !previousLock[name])

    if (toInstall.length === 0) {
      const version = installed[request.name] ?? previousLock[request.name]?.version
      if (!version) {
        throw new Error(`Could not determine the installed version of ${request.name}.`)
      }
      updateRootRequirement(
        runtime,
        request.name,
        request.constraint,
        request.explicitConstraint,
        version,
      )
      runtime.changed()
      return {
        output: `${request.name} is already installed and satisfies ${request.constraint}.\nUpdated composer.json`,
        errors: '',
      }
    }

    progress(`Lock file operations: ${toInstall.length} install${toInstall.length === 1 ? '' : 's'}, 0 updates, 0 removals`)
    for (const item of toInstall) {
      progress(`  - Locking ${item.name} (${item.candidate.version})`)
    }

    const nextLock: ComposerLock = { ...previousLock }
    let extractedFiles = 0
    for (const item of toInstall) {
      const distUrl = item.candidate.dist?.url
      if (!distUrl) throw new Error(`No distribution archive is available for ${item.name}@${item.candidate.version}.`)

      progress(`  - Installing ${item.name} (${item.candidate.version})`)
      const cacheKey = `zip:${item.name}@${item.candidate.version}`
      let archive = await cacheGet<ArrayBuffer>(cacheKey)
      if (!archive) {
        const response = await fetch(`/api/dist?url=${encodeURIComponent(distUrl)}`)
        if (!response.ok) {
          throw new Error(`Failed to download ${item.name} (HTTP ${response.status}).`)
        }
        archive = await response.arrayBuffer()
        await cacheSet(cacheKey, archive)
      }

      extractedFiles += await extractPackage(runtime, item.name, archive)
      nextLock[item.name] = {
        version: item.candidate.version,
        normalizedVersion: item.normalizedVersion,
        distUrl,
        reference: item.candidate.dist?.reference ?? null,
      }
    }

    await generateRuntimeFiles(runtime, nextLock)

    const root = resolved.find(({ name }) => name === request.name)
    if (!root) throw new Error(`Could not determine the selected version of ${request.name}.`)
    updateRootRequirement(
      runtime,
      request.name,
      request.constraint,
      request.explicitConstraint,
      root.candidate.version,
    )

    const discovery = await discoverPackages(runtime)
    await writeLock(nextLock)
    runtime.changed()

    let output = `Installed ${toInstall.length} package${toInstall.length === 1 ? '' : 's'} (${extractedFiles} files).\n`
    output += `Updated composer.json\n`
    if (discovery.output.trim()) output += discovery.output
    return { output: output.trimEnd(), errors: discovery.errors }
  } catch (error: any) {
    return { output: '', errors: error?.message || 'Unknown error during composer require.' }
  }
}

export async function clearComposerPackageCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Could not clear package cache'))
    request.onblocked = () => reject(new Error('Package cache is in use by another tab'))
  })
  metadataCache.clear()
}
