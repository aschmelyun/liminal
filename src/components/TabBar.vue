<script setup lang="ts">
defineProps<{
  activeTab: 'site' | 'code' | 'terminal' | 'agent' | 'tools'
}>()

const emit = defineEmits<{
  'update:activeTab': [value: 'site' | 'code' | 'terminal' | 'agent' | 'tools']
}>()

const tabs = [
  { key: 'site' as const, label: 'Preview' },
  { key: 'code' as const, label: 'Code' },
  { key: 'terminal' as const, label: 'Terminal' },
  { key: 'agent' as const, label: 'Agent' },
  { key: 'tools' as const, label: 'Tools' },
]
</script>

<template>
  <div class="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 shrink-0 flex items-center px-2">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer"
      :class="activeTab === tab.key
        ? 'border-stone-700 dark:border-stone-300 text-stone-700 dark:text-stone-200'
        : 'border-transparent text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600'"
      @click="emit('update:activeTab', tab.key)"
    >{{ tab.label }}</button>
  </div>
</template>
