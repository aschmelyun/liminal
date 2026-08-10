<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronsDownUp, Database, Github, RotateCw, Search, X } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { useDatabase } from '../composables/useDatabase'
import { useWorkspace } from '../composables/useWorkspace'
import FileTree, { type TreeNode } from './FileTree.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { REPO_URL } from '../lib/links'

const emit = defineEmits<{
  openFile: [path: string]
  openDatabase: []
}>()

const { booted, vfsVersion, collectVfsPaths } = usePhp()
const { tables, refresh: refreshDatabase } = useDatabase()
const { activeFilePath, collapseTree } = useWorkspace()

const paths = ref<string[]>([])
const filter = ref('')

const MAX_MATCHES = 120

const tree = computed<TreeNode>(() => {
  const root: TreeNode = {}
  for (const filePath of paths.value) {
    const parts = filePath.replace(/^\/app\//, '').split('/')
    let node = root
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        node[part] = null
      } else {
        if (!node[part] || typeof node[part] !== 'object') node[part] = {}
        node = node[part] as TreeNode
      }
    })
  }
  return root
})

const matches = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  if (!needle) return []
  return paths.value.filter(p => p.toLowerCase().includes(needle))
})

const visibleMatches = computed(() => matches.value.slice(0, MAX_MATCHES))

function split(path: string) {
  const relative = path.replace(/^\/app\//, '')
  const cut = relative.lastIndexOf('/')
  return cut === -1
    ? { name: relative, dir: '' }
    : { name: relative.slice(cut + 1), dir: relative.slice(0, cut) }
}

function refreshAll() {
  if (!booted.value) return
  paths.value = collectVfsPaths('/app')
  refreshDatabase()
}

// Walking the whole VFS is expensive; coalesce bursts of writes into one pass.
let refreshTimer: ReturnType<typeof setTimeout> | undefined
function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refreshAll, 250)
}

watch(booted, refreshAll)
watch(vfsVersion, scheduleRefresh)
onMounted(refreshAll)
</script>

<template>
  <aside class="flex h-48 min-h-0 w-full shrink-0 flex-col border-b bg-panel md:h-auto md:w-60 md:border-b-0 md:border-r">
    <div class="flex h-9 shrink-0 items-center gap-1 border-b pl-3 pr-1.5">
      <span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Files</span>
      <div class="ml-auto flex items-center">
        <Button variant="ghost" size="icon" class="size-6" aria-label="Collapse all folders" @click="collapseTree">
          <ChevronsDownUp class="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" class="size-6" aria-label="Reload file list" @click="refreshAll">
          <RotateCw class="size-3.5" />
        </Button>
      </div>
    </div>

    <div class="shrink-0 border-b p-2">
      <div class="relative">
        <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="filter"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          autocorrect="off"
          placeholder="Find a file"
          class="h-7 w-full rounded-md border border-input bg-background pl-7 pr-7 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          v-if="filter"
          type="button"
          aria-label="Clear filter"
          class="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="filter = ''"
        >
          <X class="size-3" />
        </button>
      </div>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <!-- Filter results: flat, full paths, so you can see where a match lives. -->
      <div v-if="filter.trim()" class="px-1 py-1">
        <button
          v-for="path in visibleMatches"
          :key="path"
          type="button"
          class="flex h-6 w-full items-baseline gap-2 rounded-sm px-2 text-left font-mono text-xs transition-colors hover:bg-accent"
          :class="activeFilePath === path && 'bg-accent'"
          :title="path.replace(/^\/app\//, '')"
          @click="emit('openFile', path)"
        >
          <span class="shrink-0 truncate text-foreground">{{ split(path).name }}</span>
          <span class="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground">{{ split(path).dir }}</span>
        </button>
        <p v-if="!matches.length" class="px-2 py-6 text-center text-xs text-muted-foreground">No files match “{{ filter }}”.</p>
        <p v-else-if="matches.length > MAX_MATCHES" class="px-2 py-2 text-[11px] text-muted-foreground">
          Showing {{ MAX_MATCHES }} of {{ matches.length }} matches.
        </p>
      </div>

      <div v-else-if="paths.length" class="px-1 py-1 font-mono text-xs">
        <FileTree :tree="tree" @open-file="emit('openFile', $event)" />
      </div>

      <p v-else class="px-4 py-10 text-center text-xs text-muted-foreground">Waiting for the sandbox…</p>
    </ScrollArea>

    <div class="shrink-0 border-t p-1.5">
      <button
        type="button"
        class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        @click="emit('openDatabase')"
      >
        <Database class="size-3.5 shrink-0" />
        Database
        <span v-if="tables.length" class="ml-auto font-mono text-[11px] tabular-nums">{{ tables.length }}</span>
      </button>
      <a
        :href="REPO_URL"
        target="_blank"
        rel="noreferrer"
        class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Github class="size-3.5 shrink-0" />
        Source
      </a>
    </div>
  </aside>
</template>
