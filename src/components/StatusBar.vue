<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PanelRight } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { useLocalSync } from '../composables/useLocalSync'
import { useWorkspace } from '../composables/useWorkspace'

defineProps<{ panelOpen: boolean }>()
defineEmits<{ togglePanel: [] }>()

const { booted, query } = usePhp()
const { syncState, syncStatus } = useLocalSync()
const { activeFilePath } = useWorkspace()

const runtime = ref('PHP 8.4')

watch(booted, async (ready) => {
  if (!ready) return
  try {
    const info = await query<{ php: string; laravel: string }>(`<?php
      chdir('/app');
      require '/app/vendor/autoload.php';
      echo json_encode([
        'php' => PHP_VERSION,
        'laravel' => Illuminate\\Foundation\\Application::VERSION,
      ]);
    `)
    runtime.value = `PHP ${info.php} · Laravel ${info.laravel}`
  } catch {
    /* Keep the static fallback. */
  }
}, { immediate: true })

const relativePath = computed(() => activeFilePath.value?.replace(/^\/app\//, '') ?? '')
</script>

<template>
  <footer class="flex h-6 shrink-0 items-center gap-3 border-t bg-panel pl-3 pr-1 text-[11px] text-muted-foreground">
    <span class="flex shrink-0 items-center gap-1.5">
      <span
        class="size-1.5 rounded-full"
        :class="booted ? 'bg-success' : 'bg-muted-foreground/50'"
        aria-hidden="true"
      />
      <span class="font-mono">{{ runtime }}</span>
    </span>

    <span class="min-w-0 flex-1 truncate font-mono" :title="relativePath">{{ relativePath }}</span>

    <span
      v-if="syncState !== 'disconnected'"
      class="shrink-0 truncate"
      :class="syncState === 'error' && 'text-destructive'"
    >{{ syncStatus }}</span>

    <button
      type="button"
      class="hidden size-5 shrink-0 place-items-center rounded transition-colors hover:bg-accent hover:text-foreground lg:grid"
      :class="panelOpen && 'text-foreground'"
      :aria-label="panelOpen ? 'Hide sandbox panel' : 'Show sandbox panel'"
      :aria-pressed="panelOpen"
      @click="$emit('togglePanel')"
    >
      <PanelRight class="size-3.5" />
    </button>
  </footer>
</template>
