<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { useTheme, type Theme } from '../composables/useTheme'
import { MODEL_OPTIONS, useAgentSettings } from '../composables/useAgentSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { REPO_URL } from '../lib/links'

const emit = defineEmits<{ close: [] }>()

const { booted, query, writeFile, fileExists, mkdir } = usePhp()
const { theme, setTheme } = useTheme()
const { apiKey, model } = useAgentSettings()

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/* ---------- PHP environment ---------- */

interface PhpEnvironment {
  version: string
  extensions: string[]
  ini: Record<string, string>
}

const phpEnv = ref<PhpEnvironment | null>(null)
const phpEnvError = ref('')

watch(booted, async (ready) => {
  if (!ready) return
  try {
    phpEnv.value = await query<PhpEnvironment>(`<?php
      echo json_encode([
        'version' => phpversion(),
        'extensions' => get_loaded_extensions(),
        'ini' => [
          'memory_limit' => ini_get('memory_limit'),
          'max_execution_time' => ini_get('max_execution_time'),
          'upload_max_filesize' => ini_get('upload_max_filesize'),
          'post_max_size' => ini_get('post_max_size'),
          'display_errors' => ini_get('display_errors'),
          'date.timezone' => ini_get('date.timezone'),
          'default_charset' => ini_get('default_charset'),
        ],
      ]);
    `)
  } catch (err: any) {
    phpEnvError.value = err.message || 'Failed to read the PHP environment'
  }
}, { immediate: true })

/* ---------- GitHub import ---------- */

const repoUrl = ref('')
const importing = ref(false)
const importStatus = ref('')
const importProgress = ref(0)
const importError = ref('')
const importDone = ref(false)

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\.git$/, '').replace(/\/$/, '')
  const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthand) return { owner: shorthand[1]!, repo: shorthand[2]! }
  const full = trimmed.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/|$)/)
  if (full) return { owner: full[1]!, repo: full[2]! }
  return null
}

async function importRepo() {
  importError.value = ''
  importDone.value = false

  const parsed = parseGithubUrl(repoUrl.value)
  if (!parsed) {
    importError.value = 'Use https://github.com/owner/repo or owner/repo'
    return
  }

  importing.value = true
  importProgress.value = 0

  try {
    importStatus.value = 'Fetching repository info…'
    const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`)
    if (!repoRes.ok) {
      throw new Error(repoRes.status === 404
        ? 'Repository not found. Make sure it is public.'
        : `GitHub API error: ${repoRes.status}`)
    }
    const branch = (await repoRes.json()).default_branch
    importProgress.value = 0.05

    importStatus.value = 'Fetching file tree…'
    const treeRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`)
    if (!treeRes.ok) throw new Error(`Failed to fetch file tree: ${treeRes.status}`)
    const files = (await treeRes.json()).tree.filter(
      (entry: any) => entry.type === 'blob' && !entry.path.startsWith('vendor/'),
    )
    importProgress.value = 0.1

    const CONCURRENCY = 6
    let written = 0

    for (let i = 0; i < files.length; i += CONCURRENCY) {
      await Promise.all(files.slice(i, i + CONCURRENCY).map(async (file: any) => {
        const res = await fetch(`https://raw.githubusercontent.com/${parsed!.owner}/${parsed!.repo}/${branch}/${file.path}`)
        if (!res.ok) {
          console.warn(`[import] Failed to download ${file.path}: ${res.status}`)
          return
        }
        const content = new Uint8Array(await res.arrayBuffer())

        const vfsPath = `/app/${file.path}`
        let dir = ''
        for (const part of vfsPath.split('/').slice(1, -1)) {
          dir += '/' + part
          if (!fileExists(dir)) mkdir(dir)
        }
        writeFile(vfsPath, content)

        written++
        importStatus.value = `Downloading files… (${written}/${files.length})`
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

/* ---------- Dialog plumbing ---------- */

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-200 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div class="fixed inset-0 bg-black/50 backdrop-blur-[2px]" @click="emit('close')"></div>

      <div
        class="relative w-full max-w-xl rounded-xl border bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div class="flex h-12 shrink-0 items-center border-b pl-4 pr-2">
          <h2 class="text-sm font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" class="ml-auto size-8" aria-label="Close settings" @click="emit('close')">
            <X class="size-4" />
          </Button>
        </div>

        <div class="max-h-[70vh] space-y-6 overflow-y-auto p-4">
          <section>
            <h3 class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Appearance</h3>
            <div class="mt-2 flex w-fit gap-0.5 rounded-md bg-muted p-0.5">
              <button
                v-for="option in THEMES"
                :key="option.value"
                type="button"
                class="rounded px-3 py-1 text-xs font-medium transition-colors"
                :class="theme === option.value
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'"
                @click="setTheme(option.value)"
              >{{ option.label }}</button>
            </div>
          </section>

          <Separator />

          <section>
            <h3 class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agent</h3>
            <p class="mt-1.5 text-xs leading-5 text-muted-foreground">
              The agent calls the OpenAI API straight from your browser. The key is stored in this browser's
              local storage and never sent anywhere else.
            </p>
            <div class="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                v-model="apiKey"
                type="password"
                autocomplete="off"
                placeholder="sk-…"
                aria-label="OpenAI API key"
                class="h-8 flex-1 font-mono text-xs"
              />
              <select
                v-model="model"
                aria-label="Model"
                class="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option v-for="option in MODEL_OPTIONS" :key="option" :value="option">{{ option }}</option>
              </select>
            </div>
          </section>

          <Separator />

          <section>
            <h3 class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Import from GitHub</h3>
            <p class="mt-1.5 text-xs leading-5 text-muted-foreground">
              Pull a public repository over the sandbox. <code class="rounded border bg-muted px-1 font-mono">vendor/</code>
              is skipped so the pre-built runtime survives.
            </p>
            <form class="mt-2 flex gap-2" @submit.prevent="importRepo">
              <Input
                v-model="repoUrl"
                placeholder="aschmelyun/liminal"
                aria-label="GitHub repository"
                :disabled="importing"
                class="h-8 flex-1 font-mono text-xs"
              />
              <Button type="submit" size="sm" class="h-8 shrink-0" :disabled="importing || !repoUrl.trim()">
                {{ importing ? 'Importing…' : 'Import' }}
              </Button>
            </form>

            <div v-if="importing || importDone" class="mt-2 space-y-1">
              <div class="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full transition-[width] duration-300"
                  :class="importDone ? 'bg-success' : 'bg-brand'"
                  :style="{ width: `${importProgress * 100}%` }"
                />
              </div>
              <p class="text-xs" :class="importDone ? 'text-success' : 'text-muted-foreground'">{{ importStatus }}</p>
            </div>
            <p v-if="importError" class="mt-1.5 text-xs text-destructive">{{ importError }}</p>
          </section>

          <Separator />

          <section>
            <h3 class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Runtime</h3>
            <p v-if="phpEnvError" class="mt-1.5 text-xs text-destructive">{{ phpEnvError }}</p>
            <p v-else-if="!phpEnv" class="mt-1.5 text-xs text-muted-foreground">Reading the runtime…</p>
            <template v-else>
              <dl class="mt-2 overflow-hidden rounded-md border text-xs">
                <div class="flex justify-between gap-4 border-b bg-muted/40 px-3 py-1.5">
                  <dt class="font-mono text-muted-foreground">php_version</dt>
                  <dd class="font-mono">{{ phpEnv.version }}</dd>
                </div>
                <div
                  v-for="(value, key) in phpEnv.ini"
                  :key="key"
                  class="flex justify-between gap-4 border-b px-3 py-1.5 last:border-b-0"
                >
                  <dt class="font-mono text-muted-foreground">{{ key }}</dt>
                  <dd class="truncate font-mono">{{ value || '—' }}</dd>
                </div>
              </dl>
              <details class="mt-2">
                <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {{ phpEnv.extensions.length }} loaded extensions
                </summary>
                <div class="mt-2 flex flex-wrap gap-1">
                  <span
                    v-for="extension in phpEnv.extensions"
                    :key="extension"
                    class="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >{{ extension }}</span>
                </div>
              </details>
            </template>
          </section>

          <Separator />

          <section>
            <h3 class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">About</h3>
            <p class="mt-1.5 text-xs leading-5 text-muted-foreground">
              Liminal runs a full Laravel 12 app on PHP 8.4 compiled to WebAssembly. There is no server — routing,
              Artisan and SQLite all execute in this tab, and nothing you write leaves the browser.
            </p>
            <ul class="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
              <li>Save the open file with <kbd class="rounded border bg-muted px-1 font-mono">⌘/Ctrl + S</kbd>.</li>
              <li>Walk Terminal history with <kbd class="rounded border bg-muted px-1 font-mono">↑</kbd> / <kbd class="rounded border bg-muted px-1 font-mono">↓</kbd>.</li>
              <li>Reloading the page resets the sandbox — export or mirror first.</li>
            </ul>
            <a
              :href="REPO_URL"
              target="_blank"
              rel="noreferrer"
              class="mt-2 inline-block text-xs text-brand underline-offset-4 hover:underline"
            >github.com/aschmelyun/liminal</a>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
