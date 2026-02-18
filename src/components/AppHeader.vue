<script setup lang="ts">
import { ref } from 'vue'
import HelpModal from './HelpModal.vue'

const helpOpen = ref(false)
</script>

<template>
  <header class="sticky top-0 z-50 bg-white/80 dark:bg-stone-900/80 backdrop-blur border-b border-stone-200 dark:border-stone-700 shrink-0">
    <div class="px-4 py-3 flex items-center justify-between">
      <span class="text-3xl text-stone-800 dark:text-stone-100" style="font-family: 'Jacquard 24', serif;">Liminal</span>
      <div class="flex items-center gap-2">
        <span class="text-xs text-stone-400 dark:text-stone-500 font-mono">Laravel 12 / PHP 8.4</span>
        <button
          class="w-5 h-5 flex items-center justify-center rounded-full border border-stone-300 dark:border-stone-600 text-stone-400 dark:text-stone-500 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors cursor-pointer text-xs font-semibold leading-none"
          aria-label="Help"
          @click="helpOpen = true"
        >?</button>
      </div>
    </div>
  </header>

  <HelpModal v-if="helpOpen" @close="helpOpen = false" />
</template>
