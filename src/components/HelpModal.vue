<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{ close: [] }>()

const tabs = [
  {
    name: 'Preview',
    description: 'Enter a route path and see the rendered Laravel response. Tailwind CSS is injected automatically.',
  },
  {
    name: 'Code',
    description: 'Browse and edit project files. Syntax highlighting for PHP, Blade, JS, TS, JSON, and CSS.',
  },
  {
    name: 'Terminal',
    description: 'Run Artisan commands (make:model, migrate, route:list…) directly in the browser.',
  },
  {
    name: 'Agent',
    description: 'AI assistant (OpenAI) that can read/write files and run Artisan commands to build features for you.',
  },
  {
    name: 'Tools',
    description: 'Import a public GitHub repo, export your filesystem as a .zip, sync to a local folder, and change the color theme.',
  },
]

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')"></div>

      <!-- Modal -->
      <div class="relative bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <!-- Header -->
        <div class="flex items-start justify-between px-6 pt-6 pb-4 border-b border-stone-100 dark:border-stone-800">
          <div>
            <h2 class="text-lg font-semibold text-stone-800 dark:text-stone-100">About Liminal</h2>
            <p class="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Laravel 12 · PHP 8.4 · WebAssembly</p>
          </div>
          <button
            class="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer p-1 -mr-1 -mt-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            aria-label="Close"
            @click="emit('close')"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-5">
          <p class="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            Liminal is a browser-based Laravel IDE. PHP 8.4 runs entirely in WebAssembly — no server, no installs, no uploads. Your code executes locally in the page.
          </p>

          <!-- Tabs -->
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Views</p>
            <div class="space-y-1">
              <div v-for="tab in tabs" :key="tab.name" class="flex gap-3 px-3 py-2.5 rounded-lg bg-stone-50 dark:bg-stone-800">
                <span class="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 shrink-0 w-16 pt-px">{{ tab.name }}</span>
                <span class="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">{{ tab.description }}</span>
              </div>
            </div>
          </div>

          <!-- Tips -->
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Tips</p>
            <ul class="space-y-1.5 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
              <li class="flex gap-2">
                <span class="text-stone-300 dark:text-stone-600 select-none shrink-0">—</span>
                Save files with <kbd class="px-1.5 py-0.5 text-xs bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded border border-stone-200 dark:border-stone-600 font-mono">Cmd/Ctrl+S</kbd> in the Code view.
              </li>
              <li class="flex gap-2">
                <span class="text-stone-300 dark:text-stone-600 select-none shrink-0">—</span>
                Use arrow keys in the Terminal to navigate command history.
              </li>
              <li class="flex gap-2">
                <span class="text-stone-300 dark:text-stone-600 select-none shrink-0">—</span>
                The <span class="font-medium text-stone-600 dark:text-stone-300">vendor/</span> directory is pre-bundled — skip it when importing from GitHub.
              </li>
              <li class="flex gap-2">
                <span class="text-stone-300 dark:text-stone-600 select-none shrink-0">—</span>
                Share your project via a URL from the Tools tab — it encodes only your diffs.
              </li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <p class="text-xs text-stone-400 dark:text-stone-500">
            Press <kbd class="px-1 py-0.5 font-mono text-xs bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 rounded border border-stone-200 dark:border-stone-600">Esc</kbd> to close
          </p>
          <button
            class="px-3 py-1.5 text-xs font-medium text-white bg-rose-500 rounded-md hover:bg-rose-600 cursor-pointer"
            @click="emit('close')"
          >Got it</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
