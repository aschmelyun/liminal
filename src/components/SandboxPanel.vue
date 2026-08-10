<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, FileCode2, Github, Settings2 } from 'lucide-vue-next'
import { useLocalSync } from '../composables/useLocalSync'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

const emit = defineEmits<{ openTools: [] }>()
const sqliteEnabled = ref(true)
const entryPoint = ref('public/index.php')
const { syncState, syncStatus, isSupported, connect, disconnect } = useLocalSync()

const localFolderEnabled = computed(() => syncState.value === 'connected' || syncState.value === 'syncing-initial')

function toggleLocalFolder(enabled: boolean) {
  if (!enabled && localFolderEnabled.value) disconnect()
  if (enabled && syncState.value === 'disconnected') connect()
}
</script>

<template>
  <aside class="hidden min-h-0 w-[300px] shrink-0 border-l bg-background lg:block">
    <ScrollArea class="h-full">
      <div class="p-4">
        <div class="mb-4 flex items-center gap-2">
          <Settings2 class="size-4" />
          <h2 class="text-sm font-semibold">Sandbox</h2>
        </div>

        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-muted-foreground">Runtime</label>
            <Button variant="outline" class="w-full justify-between font-mono" size="sm">
              PHP 8.4
              <ChevronRight class="size-3.5 rotate-90" />
            </Button>
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-muted-foreground">Entry point</label>
            <Input v-model="entryPoint" class="h-8 font-mono text-xs" />
          </div>
        </div>

        <Separator class="my-5" />

        <div>
          <div class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Environment</div>
          <div class="flex items-start justify-between gap-4 py-3">
            <div class="min-w-0">
              <div class="text-sm font-medium">SQLite</div>
              <div class="mt-0.5 text-xs leading-5 text-muted-foreground">Persistent database in the sandbox filesystem.</div>
            </div>
            <Switch v-model="sqliteEnabled" class="mt-0.5" />
          </div>
          <Separator />
          <div class="flex items-start justify-between gap-4 py-3">
            <div class="min-w-0">
              <div class="text-sm font-medium">Local folder</div>
              <div class="mt-0.5 text-xs leading-5 text-muted-foreground">
                {{ localFolderEnabled ? syncStatus : 'Mirror project files to a directory on this device.' }}
              </div>
            </div>
            <Switch :model-value="localFolderEnabled" :disabled="!isSupported" class="mt-0.5" @update:model-value="toggleLocalFolder" />
          </div>
        </div>

        <Separator class="my-5" />

        <div class="space-y-2">
          <div class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Project</div>
          <Button variant="outline" size="sm" class="w-full justify-start" @click="emit('openTools')">
            <Github />
            Import from GitHub
          </Button>
          <Button variant="outline" size="sm" class="w-full justify-start" @click="emit('openTools')">
            <FileCode2 />
            Export sandbox
          </Button>
        </div>
      </div>
    </ScrollArea>
  </aside>
</template>
