<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { usePhp } from './composables/usePhp'
import { useShareUrl } from './composables/useShareUrl'
import { useTheme } from './composables/useTheme'
import LoadingOverlay from './components/LoadingOverlay.vue'
import AppHeader from './components/AppHeader.vue'
import StatusBar from './components/StatusBar.vue'
import SiteView from './components/SiteView.vue'
import CodeView from './components/CodeView.vue'
import TerminalView from './components/TerminalView.vue'
import DatabaseView from './components/DatabaseView.vue'
import AgentView from './components/AgentView.vue'
import WorkspaceSidebar from './components/WorkspaceSidebar.vue'
import SandboxPanel from './components/SandboxPanel.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import type { WorkspaceTab } from './lib/tabs'

const PANEL_STORAGE = 'liminal-panel-open'

const activeTab = ref<WorkspaceTab>('preview')
const loading = ref(true)
const loadingFailed = ref(false)
const settingsOpen = ref(false)
const panelOpen = ref(localStorage.getItem(PANEL_STORAGE) !== 'false')
const codeViewRef = ref<{ openFile: (path: string) => void } | null>(null)

const { boot, bootProgress, bootStatus, bootLog } = usePhp()
const { captureFromUrl, applyPendingPayload } = useShareUrl()
useTheme()

const hasSharePayload = captureFromUrl()

const gridColumns = computed(() =>
  panelOpen.value
    ? 'md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)_18rem]'
    : 'md:grid-cols-[15rem_minmax(0,1fr)]',
)

onMounted(async () => {
  try {
    await boot()
    if (hasSharePayload) await applyPendingPayload()
    setTimeout(() => { loading.value = false }, 400)
  } catch (err) {
    loadingFailed.value = true
    console.error(err)
  }
})

function openFile(path: string) {
  activeTab.value = 'code'
  void nextTick(() => codeViewRef.value?.openFile(path))
}

function togglePanel() {
  panelOpen.value = !panelOpen.value
  localStorage.setItem(PANEL_STORAGE, String(panelOpen.value))
}
</script>

<template>
  <div class="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground antialiased">
    <LoadingOverlay
      v-if="loading"
      :progress="bootProgress"
      :status="bootStatus"
      :log="bootLog"
      :failed="loadingFailed"
    />

    <AppHeader v-model="activeTab" @open-settings="settingsOpen = true" />

    <div
      class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1"
      :class="gridColumns"
    >
      <WorkspaceSidebar @open-file="openFile" @open-database="activeTab = 'database'" />

      <main class="flex min-h-0 min-w-0 flex-col bg-background">
        <SiteView v-show="activeTab === 'preview'" />
        <CodeView ref="codeViewRef" v-show="activeTab === 'code'" />
        <TerminalView v-show="activeTab === 'terminal'" />
        <DatabaseView v-show="activeTab === 'database'" />
        <AgentView v-show="activeTab === 'agent'" @open-settings="settingsOpen = true" />
      </main>

      <SandboxPanel v-if="panelOpen" />
    </div>

    <StatusBar :panel-open="panelOpen" @toggle-panel="togglePanel" />

    <SettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>
