<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { Code2, ExternalLink, Monitor, SquareTerminal, ArrowLeft, Bot, Wrench } from 'lucide-vue-next'
import { usePhp } from './composables/usePhp'
import { useShareUrl } from './composables/useShareUrl'
import { useTheme } from './composables/useTheme'
import LoadingOverlay from './components/LoadingOverlay.vue'
import AppHeader from './components/AppHeader.vue'
import SiteView from './components/SiteView.vue'
import CodeView from './components/CodeView.vue'
import TerminalView from './components/TerminalView.vue'
import AgentView from './components/AgentView.vue'
import ToolsView from './components/ToolsView.vue'
import WorkspaceSidebar from './components/WorkspaceSidebar.vue'
import SandboxPanel from './components/SandboxPanel.vue'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type ActiveTab = 'site' | 'code' | 'terminal' | 'agent' | 'tools'
const activeTab = ref<ActiveTab>('site')
const loading = ref(true)
const loadingFailed = ref(false)
const siteViewRef = ref<{ refresh: () => Promise<void> } | null>(null)
const codeViewRef = ref<{ openFile: (path: string) => void } | null>(null)

const { boot, booted, bootProgress, bootStatus } = usePhp()
const { captureFromUrl, applyPendingPayload } = useShareUrl()
useTheme()

const hasSharePayload = captureFromUrl()

onMounted(async () => {
  try {
    await boot()
    if (hasSharePayload) await applyPendingPayload()
    setTimeout(() => {
      loading.value = false
    }, 400)
  } catch (err: any) {
    loadingFailed.value = true
    console.error(err)
  }
})

function runPreview() {
  activeTab.value = 'site'
  void nextTick(() => siteViewRef.value?.refresh())
}

function openFile(path: string) {
  activeTab.value = 'code'
  void nextTick(() => codeViewRef.value?.openFile(path))
}

function resetSandbox() {
  window.location.reload()
}
</script>

<template>
  <div class="fixed inset-0 flex flex-col overflow-hidden bg-muted/30 text-foreground antialiased">
    <LoadingOverlay
      v-if="loading"
      :progress="bootProgress"
      :status="bootStatus"
      :failed="loadingFailed"
    />

    <AppHeader @run="runPreview" @reset="resetSandbox" @open-agent="activeTab = 'agent'" />

    <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
      <WorkspaceSidebar @open-file="openFile" @open-tools="activeTab = 'tools'" />

      <main class="flex min-h-0 min-w-0 flex-col bg-background">
        <template v-if="activeTab === 'site' || activeTab === 'code' || activeTab === 'terminal'">
          <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col">
            <div class="flex h-11 shrink-0 items-center border-b px-3">
              <TabsList class="h-8 bg-muted/70">
                <TabsTrigger value="site" class="gap-1.5 text-xs">
                  <Monitor class="size-3.5" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="code" class="gap-1.5 text-xs">
                  <Code2 class="size-3.5" />
                  Code
                </TabsTrigger>
                <TabsTrigger value="terminal" class="gap-1.5 text-xs">
                  <SquareTerminal class="size-3.5" />
                  Terminal
                </TabsTrigger>
              </TabsList>

              <div class="ml-auto flex items-center gap-2">
                <span class="hidden font-mono text-[11px] text-muted-foreground sm:inline">http://localhost:8000</span>
                <Button variant="ghost" size="icon" class="size-7" aria-label="Open preview" @click="runPreview">
                  <ExternalLink class="size-3.5" />
                </Button>
              </div>
            </div>

            <SiteView ref="siteViewRef" v-show="activeTab === 'site'" />
            <CodeView ref="codeViewRef" v-show="activeTab === 'code'" />
            <TerminalView v-show="activeTab === 'terminal'" />
          </Tabs>
        </template>

        <template v-else>
          <div class="flex h-11 shrink-0 items-center gap-2 border-b px-3">
            <Button variant="ghost" size="sm" @click="activeTab = 'site'">
              <ArrowLeft />
              Workspace
            </Button>
            <span class="text-sm font-semibold">
              <Bot v-if="activeTab === 'agent'" class="mr-1 inline size-4" />
              <Wrench v-else class="mr-1 inline size-4" />
              {{ activeTab === 'agent' ? 'Agent' : 'Tools' }}
            </span>
          </div>
          <AgentView v-if="activeTab === 'agent'" />
          <ToolsView v-else />
        </template>
      </main>

      <SandboxPanel @open-tools="activeTab = 'tools'" />
    </div>
  </div>
</template>
