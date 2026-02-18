<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePhp } from '../composables/usePhp'
import { useLocalSync } from '../composables/useLocalSync'
import { useShareUrl } from '../composables/useShareUrl'
import { useTheme, type Theme } from '../composables/useTheme'
import JSZip from 'jszip'

const { php, booted, writeFile, readFileAsBuffer, fileExists, mkdir, collectVfsPaths } = usePhp()
const { syncState, syncStatus, syncError, syncProgress, isSupported, connect, disconnect } = useLocalSync()
const { sharing, shareStatus, shareError, generateShareUrl } = useShareUrl()
const { theme, setTheme } = useTheme()

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

interface PhpEnvironment {
  version: string
  extensions: string[]
  ini: Record<string, string>
}

const phpEnv = ref<PhpEnvironment | null>(null)
const phpEnvLoading = ref(false)
const phpEnvError = ref('')

async function loadPhpEnvironment() {
  if (!php.value) return
  phpEnvLoading.value = true
  phpEnvError.value = ''

  try {
    const result = await php.value.run({
      code: `<?php
        echo json_encode([
          'version' => phpversion(),
          'extensions' => get_loaded_extensions(),
          'ini' => [
            'memory_limit' => ini_get('memory_limit'),
            'max_execution_time' => ini_get('max_execution_time'),
            'upload_max_filesize' => ini_get('upload_max_filesize'),
            'post_max_size' => ini_get('post_max_size'),
            'display_errors' => ini_get('display_errors'),
            'error_reporting' => ini_get('error_reporting'),
            'date.timezone' => ini_get('date.timezone'),
            'default_charset' => ini_get('default_charset'),
          ],
        ]);
      `,
    })
    phpEnv.value = JSON.parse(result.text)
  } catch (err: any) {
    phpEnvError.value = err.message || 'Failed to load PHP environment'
  } finally {
    phpEnvLoading.value = false
  }
}

watch(booted, (ready) => {
  if (ready) loadPhpEnvironment()
}, { immediate: true })

const repoUrl = ref('')
const importing = ref(false)
const importStatus = ref('')
const importProgress = ref(0)
const importError = ref('')
const importDone = ref(false)

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\.git$/, '').replace(/\/$/, '')

  // owner/repo shorthand
  const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthand) return { owner: shorthand[1]!, repo: shorthand[2]! }

  // Full GitHub URL
  const full = trimmed.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/|$)/)
  if (full) return { owner: full[1]!, repo: full[2]! }

  return null
}

async function importRepo() {
  importError.value = ''
  importDone.value = false

  const parsed = parseGithubUrl(repoUrl.value)
  if (!parsed) {
    importError.value = 'Invalid GitHub URL. Use https://github.com/owner/repo or owner/repo'
    return
  }

  importing.value = true
  importProgress.value = 0

  try {
    // 1. Get default branch
    importStatus.value = 'Fetching repository info...'
    const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`)
    if (!repoRes.ok) {
      throw new Error(repoRes.status === 404
        ? 'Repository not found. Make sure it is public.'
        : `GitHub API error: ${repoRes.status}`)
    }
    const repoData = await repoRes.json()
    const branch = repoData.default_branch
    importProgress.value = 0.05

    // 2. Fetch file tree
    importStatus.value = 'Fetching file tree...'
    const treeRes = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`
    )
    if (!treeRes.ok) throw new Error(`Failed to fetch file tree: ${treeRes.status}`)
    const treeData = await treeRes.json()
    importProgress.value = 0.1

    const files = treeData.tree.filter(
      (entry: any) => entry.type === 'blob' && !entry.path.startsWith('vendor/')
    )

    // 3. Download files from raw.githubusercontent.com (CORS-friendly)
    const CONCURRENCY = 6
    let written = 0

    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(async (file: any) => {
        const rawUrl = `https://raw.githubusercontent.com/${parsed!.owner}/${parsed!.repo}/${branch}/${file.path}`
        const res = await fetch(rawUrl)
        if (!res.ok) {
          console.warn(`[import] Failed to download ${file.path}: ${res.status}`)
          return
        }
        const content = new Uint8Array(await res.arrayBuffer())

        const vfsPath = `/app/${file.path}`
        const parts = vfsPath.split('/').slice(1, -1)
        let dir = ''
        for (const part of parts) {
          dir += '/' + part
          if (!fileExists(dir)) mkdir(dir)
        }
        writeFile(vfsPath, content)

        written++
        importStatus.value = `Downloading files... (${written}/${files.length})`
        importProgress.value = 0.1 + (written / files.length) * 0.9
      }))
    }

    importStatus.value = `Imported ${written} files from ${parsed.owner}/${parsed.repo}.`
    importProgress.value = 1
    importDone.value = true
  } catch (err: any) {
    importError.value = err.message || 'Import failed'
    importStatus.value = ''
  } finally {
    importing.value = false
  }
}

const exporting = ref(false)
const exportStatus = ref('')

async function exportFilesystem() {
  exporting.value = true
  exportStatus.value = 'Collecting files...'

  try {
    const paths = collectVfsPaths('/app')
    const zip = new JSZip()

    for (let i = 0; i < paths.length; i++) {
      const vfsPath = paths[i]!
      const relativePath = vfsPath.replace(/^\/app\//, '')
      const content = readFileAsBuffer(vfsPath)
      zip.file(relativePath, content)

      if ((i + 1) % 100 === 0 || i + 1 === paths.length) {
        exportStatus.value = `Packing files... (${i + 1}/${paths.length})`
      }
    }

    exportStatus.value = 'Generating zip...'
    const blob = await zip.generateAsync({ type: 'blob' })
    triggerDownload(blob, 'laravel-project.zip')
    exportStatus.value = ''
  } catch (err: any) {
    exportStatus.value = `Export failed: ${err.message}`
  } finally {
    exporting.value = false
  }
}

const dbExporting = ref(false)
const dbExportStatus = ref('')

function exportDatabase() {
  dbExporting.value = true
  dbExportStatus.value = ''

  try {
    const dbPath = '/app/database/database.sqlite'
    if (!fileExists(dbPath)) {
      dbExportStatus.value = 'No database file found at database/database.sqlite'
      return
    }

    const content = readFileAsBuffer(dbPath)
    const copy = new Uint8Array(content.length)
    copy.set(content)
    const blob = new Blob([copy], { type: 'application/x-sqlite3' })
    triggerDownload(blob, 'database.sqlite')
  } catch (err: any) {
    dbExportStatus.value = `Export failed: ${err.message}`
  } finally {
    dbExporting.value = false
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <div class="max-w-2xl mx-auto space-y-8">

      <!-- Appearance -->
      <section>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">Appearance</h2>
        <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
          <p class="text-sm text-stone-500 dark:text-stone-400 mb-3">Choose your preferred color scheme.</p>
          <div class="flex gap-1 bg-stone-100 dark:bg-stone-900 rounded-lg p-1 w-fit">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              class="px-4 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer"
              :class="theme === option.value
                ? 'bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 shadow-xs'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'"
              @click="setTheme(option.value)"
            >{{ option.label }}</button>
          </div>
        </div>
      </section>

      <!-- GitHub Import -->
      <section>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">GitHub Import</h2>
        <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4 space-y-3">
          <p class="text-sm text-stone-500 dark:text-stone-400">
            Import a public Laravel repository. Files from the repo will replace matching files in the virtual filesystem.
            The <code class="text-stone-600 dark:text-stone-300">vendor/</code> directory is skipped to preserve the WASM runtime.
          </p>

          <div class="flex gap-2">
            <input
              v-model="repoUrl"
              type="text"
              placeholder="https://github.com/owner/repo"
              :disabled="importing"
              class="flex-1 px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200
                     focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent
                     disabled:opacity-50 disabled:bg-stone-50 dark:disabled:bg-stone-800"
              @keydown.enter="importRepo"
            />
            <button
              :disabled="importing || !repoUrl.trim()"
              class="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md
                     hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed
                     cursor-pointer shrink-0"
              @click="importRepo"
            >
              {{ importing ? 'Importing...' : 'Import' }}
            </button>
          </div>

          <!-- Progress bar -->
          <div v-if="importing || importDone" class="space-y-1">
            <div class="h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="importDone ? 'bg-emerald-500' : 'bg-rose-500'"
                :style="{ width: `${importProgress * 100}%` }"
              />
            </div>
            <p class="text-xs" :class="importDone ? 'text-emerald-600' : 'text-stone-400'">
              {{ importStatus }}
            </p>
          </div>

          <!-- Error -->
          <p v-if="importError" class="text-xs text-red-600">{{ importError }}</p>
        </div>
      </section>

      <!-- Share -->
      <section>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">Share</h2>
        <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4 space-y-3">
          <p class="text-sm text-stone-500 dark:text-stone-400">
            Generate a shareable URL containing your file changes. The URL encodes a diff against the base Laravel app — anyone who opens it will see your modifications applied automatically.
          </p>
          <button
            :disabled="sharing"
            class="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md
                   hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed
                   cursor-pointer"
            @click="generateShareUrl"
          >
            {{ sharing ? 'Generating...' : 'Copy Share URL' }}
          </button>
          <p v-if="shareStatus" class="text-xs text-stone-500 dark:text-stone-400">{{ shareStatus }}</p>
          <p v-if="shareError" class="text-xs text-red-600">{{ shareError }}</p>
        </div>
      </section>

      <!-- Export -->
      <section>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">Export</h2>
        <div class="space-y-3">
          <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-stone-700 dark:text-stone-200">Project Filesystem</p>
              <p class="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                {{ exporting ? exportStatus : 'Download the entire /app directory as a .zip archive.' }}
              </p>
            </div>
            <button
              :disabled="exporting"
              class="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md
                     hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed
                     cursor-pointer shrink-0"
              @click="exportFilesystem"
            >
              {{ exporting ? 'Exporting...' : 'Download .zip' }}
            </button>
          </div>
          <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-stone-700 dark:text-stone-200">SQLite Database</p>
              <p class="text-xs mt-0.5" :class="dbExportStatus ? 'text-red-500' : 'text-stone-400 dark:text-stone-500'">
                {{ dbExportStatus || 'Download database/database.sqlite.' }}
              </p>
            </div>
            <button
              :disabled="dbExporting"
              class="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md
                     hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed
                     cursor-pointer shrink-0"
              @click="exportDatabase"
            >
              {{ dbExporting ? 'Exporting...' : 'Download .sqlite' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Local Sync -->
      <section>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">Local Sync</h2>
        <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4 space-y-3">

          <!-- Not supported -->
          <template v-if="!isSupported">
            <p class="text-sm text-stone-500 dark:text-stone-400">
              Your browser does not support the File System Access API.
              Use <span class="font-medium text-stone-700 dark:text-stone-200">Chrome</span>, <span class="font-medium text-stone-700 dark:text-stone-200">Edge</span>, or <span class="font-medium text-stone-700 dark:text-stone-200">Opera</span> to enable local folder mirroring.
            </p>
          </template>

          <!-- Disconnected -->
          <template v-else-if="syncState === 'disconnected'">
            <p class="text-sm text-stone-500 dark:text-stone-400">
              Mirror the virtual filesystem to a local folder for editing in VS Code or any external editor. Changes sync both ways.
            </p>
            <button
              class="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md
                     hover:bg-rose-600 cursor-pointer"
              @click="connect"
            >
              Mirror to Local Folder
            </button>
          </template>

          <!-- Initial sync -->
          <template v-else-if="syncState === 'syncing-initial'">
            <div class="space-y-1">
              <div class="h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-rose-500 rounded-full transition-all duration-300"
                  :style="{ width: `${syncProgress * 100}%` }"
                />
              </div>
              <p class="text-xs text-stone-400 dark:text-stone-500">{{ syncStatus }}</p>
            </div>
          </template>

          <!-- Connected -->
          <template v-else-if="syncState === 'connected'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                <p class="text-sm text-stone-600 dark:text-stone-300">{{ syncStatus }}</p>
              </div>
              <button
                class="px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 rounded-md
                       hover:bg-stone-200 dark:hover:bg-stone-600 cursor-pointer"
                @click="disconnect"
              >
                Disconnect
              </button>
            </div>
          </template>

          <!-- Error -->
          <template v-else-if="syncState === 'error'">
            <p class="text-sm text-red-600">{{ syncError }}</p>
            <button
              class="px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md
                     hover:bg-rose-600 cursor-pointer"
              @click="connect"
            >
              Retry
            </button>
          </template>

        </div>
      </section>

      <!-- PHP Environment -->
      <section>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">PHP Environment</h2>

        <div v-if="phpEnvLoading" class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
          <p class="text-sm text-stone-400 dark:text-stone-500">Loading PHP environment...</p>
        </div>

        <div v-else-if="phpEnvError" class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
          <p class="text-sm text-red-600">{{ phpEnvError }}</p>
        </div>

        <div v-else-if="phpEnv" class="space-y-3">
          <!-- Version -->
          <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">Version</p>
            <p class="text-sm font-mono text-stone-700 dark:text-stone-200">PHP {{ phpEnv.version }}</p>
          </div>

          <!-- INI Settings -->
          <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Configuration</p>
            <table class="w-full text-sm">
              <tbody>
                <tr v-for="(value, key) in phpEnv.ini" :key="key" class="border-t border-stone-100 dark:border-stone-700 first:border-0">
                  <td class="py-1.5 pr-4 font-mono text-stone-500 dark:text-stone-400 whitespace-nowrap">{{ key }}</td>
                  <td class="py-1.5 font-mono text-stone-700 dark:text-stone-200">{{ value || '(empty)' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Extensions -->
          <div class="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">
              Loaded Extensions ({{ phpEnv.extensions.length }})
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="ext in phpEnv.extensions"
                :key="ext"
                class="px-2 py-0.5 text-xs font-mono bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded"
              >{{ ext }}</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>
