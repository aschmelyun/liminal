<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Link2 } from 'lucide-vue-next'
import JSZip from 'jszip'
import { usePhp } from '../composables/usePhp'
import { useLocalSync } from '../composables/useLocalSync'
import { useShareUrl } from '../composables/useShareUrl'
import { DB_PATH } from '../composables/useDatabase'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { formatBytes, triggerDownload } from '../lib/download'

const { collectVfsPaths, readFileAsBuffer, fileExists } = usePhp()
const { syncState, syncStatus, syncError, syncProgress, isSupported, connect, disconnect } = useLocalSync()
const { sharing, shareStatus, shareError, generateShareUrl } = useShareUrl()

const localFolderOn = computed(() => syncState.value === 'connected' || syncState.value === 'syncing-initial')

function toggleLocalFolder(enabled: boolean) {
  if (!enabled && localFolderOn.value) disconnect()
  if (enabled && (syncState.value === 'disconnected' || syncState.value === 'error')) connect()
}

const localFolderHint = computed(() => {
  if (!isSupported) return 'Needs a Chromium browser (File System Access API).'
  if (syncState.value === 'error') return syncError.value
  if (localFolderOn.value) return syncStatus.value
  return 'Mirror the project to a folder on this device, editable both ways.'
})

const exporting = ref('')
const exportError = ref('')

async function exportProject() {
  exporting.value = 'project'
  exportError.value = ''
  try {
    const zip = new JSZip()
    for (const path of collectVfsPaths('/app')) {
      zip.file(path.replace(/^\/app\//, ''), readFileAsBuffer(path))
    }
    triggerDownload(await zip.generateAsync({ type: 'blob' }), 'liminal-project.zip')
  } catch (err: any) {
    exportError.value = err.message || 'Export failed'
  } finally {
    exporting.value = ''
  }
}

function exportDatabase() {
  exporting.value = 'database'
  exportError.value = ''
  try {
    if (!fileExists(DB_PATH)) {
      exportError.value = 'No database file at database/database.sqlite'
      return
    }
    const buffer = readFileAsBuffer(DB_PATH)
    const copy = new Uint8Array(buffer.length)
    copy.set(buffer)
    triggerDownload(new Blob([copy], { type: 'application/x-sqlite3' }), 'database.sqlite')
  } catch (err: any) {
    exportError.value = err.message || 'Export failed'
  } finally {
    exporting.value = ''
  }
}

const databaseSize = computed(() => {
  try {
    return fileExists(DB_PATH) ? formatBytes(readFileAsBuffer(DB_PATH).length) : null
  } catch {
    return null
  }
})
</script>

<template>
  <aside class="hidden min-h-0 w-72 shrink-0 flex-col border-l bg-panel lg:flex">
    <div class="flex h-9 shrink-0 items-center border-b px-3">
      <span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sandbox</span>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-5 p-3">
        <section>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs font-medium">Local folder</div>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ localFolderHint }}</p>
            </div>
            <Switch
              :model-value="localFolderOn"
              :disabled="!isSupported"
              class="mt-0.5 shrink-0"
              aria-label="Mirror project to a local folder"
              @update:model-value="toggleLocalFolder"
            />
          </div>
          <div v-if="syncState === 'syncing-initial'" class="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full bg-brand transition-[width] duration-200" :style="{ width: `${syncProgress * 100}%` }" />
          </div>
        </section>

        <Separator />

        <section>
          <div class="text-xs font-medium">Share</div>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">
            Copies a link that encodes your edits as a diff against the base app.
          </p>
          <Button variant="outline" size="sm" class="mt-2 w-full justify-start" :disabled="sharing" @click="generateShareUrl">
            <Link2 />
            {{ sharing ? 'Generating…' : 'Copy share link' }}
          </Button>
          <p v-if="shareError" class="mt-1.5 text-xs text-destructive">{{ shareError }}</p>
          <p v-else-if="shareStatus" class="mt-1.5 text-xs text-muted-foreground">{{ shareStatus }}</p>
        </section>

        <Separator />

        <section>
          <div class="text-xs font-medium">Export</div>
          <div class="mt-2 space-y-1.5">
            <Button variant="outline" size="sm" class="w-full justify-start" :disabled="!!exporting" @click="exportProject">
              <Download />
              {{ exporting === 'project' ? 'Packing…' : 'Project (.zip)' }}
            </Button>
            <Button variant="outline" size="sm" class="w-full justify-start" :disabled="!!exporting" @click="exportDatabase">
              <Download />
              Database (.sqlite)
              <span v-if="databaseSize" class="ml-auto font-mono text-[11px] text-muted-foreground">{{ databaseSize }}</span>
            </Button>
          </div>
          <p v-if="exportError" class="mt-1.5 text-xs text-destructive">{{ exportError }}</p>
        </section>
      </div>
    </ScrollArea>
  </aside>
</template>
