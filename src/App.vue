<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePhp } from './composables/usePhp'
import { useShareUrl } from './composables/useShareUrl'
import LoadingOverlay from './components/LoadingOverlay.vue'
import AppHeader from './components/AppHeader.vue'
import TabBar from './components/TabBar.vue'
import SiteView from './components/SiteView.vue'
import CodeView from './components/CodeView.vue'
import TerminalView from './components/TerminalView.vue'
import AgentView from './components/AgentView.vue'
import ToolsView from './components/ToolsView.vue'

const activeTab = ref<'site' | 'code' | 'terminal' | 'agent' | 'tools'>('site')
const loading = ref(true)
const loadingFailed = ref(false)

const { boot, booted, bootProgress, bootStatus } = usePhp()
const { captureFromUrl, applyPendingPayload } = useShareUrl()

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
</script>

<template>
  <div class="bg-stone-50 text-stone-700 antialiased fixed inset-0 flex flex-col overflow-hidden">
    <LoadingOverlay
      v-if="loading"
      :progress="bootProgress"
      :status="bootStatus"
      :failed="loadingFailed"
    />

    <!-- Top accent border -->
    <div class="h-1.5 bg-rose-500 shrink-0"></div>

    <AppHeader />
    <TabBar :active-tab="activeTab" @update:active-tab="activeTab = $event" />

    <SiteView v-show="activeTab === 'site'" />
    <CodeView v-show="activeTab === 'code'" />
    <TerminalView v-show="activeTab === 'terminal'" />
    <AgentView v-show="activeTab === 'agent'" />
    <ToolsView v-show="activeTab === 'tools'" />
  </div>
</template>
