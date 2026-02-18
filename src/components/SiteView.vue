<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePhp } from '../composables/usePhp'

const { navigateTo, booted } = usePhp()

watch(booted, (ready) => {
  if (ready) go()
}, { immediate: true })

const routeInput = ref('/')
const navigating = ref(false)
const srcdoc = ref(`<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:system-ui;color:#a8a29e;">Loading...</div>`)

const tailwindCdn = `<script src="https://unpkg.com/@tailwindcss/browser@4"><\/script>`

function injectTailwind(html: string): string {
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${tailwindCdn}`)
  }
  return tailwindCdn + html
}

async function go() {
  if (navigating.value) return
  navigating.value = true
  const path = routeInput.value

  srcdoc.value = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:system-ui;color:#a8a29e;">Loading ${path}...</div>`

  try {
    const html = await navigateTo(path)
    srcdoc.value = html ? injectTailwind(html) : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:system-ui;color:#a8a29e;">No output from ${path}</div>`
  } catch (err: any) {
    srcdoc.value = `<div style="padding:2rem;font-family:system-ui;"><h2 style="color:#dc2626;margin:0 0 1rem;">Error</h2><pre style="background:#fef2f2;padding:1rem;border-radius:0.5rem;overflow:auto;color:#991b1b;font-size:0.875rem;">${err.message}</pre></div>`
    console.error(err)
  } finally {
    navigating.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') go()
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div class="px-4 py-2 border-b border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0 flex items-center gap-2">
      <label class="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider shrink-0">Route</label>
      <div class="flex items-center flex-1 gap-1.5">
        <input
          v-model="routeInput"
          type="text"
          spellcheck="false"
          class="flex-1 px-2 py-1 text-sm font-mono bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-500 focus:bg-white dark:focus:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="navigating"
          @keydown="onKeydown"
        />
        <button
          :disabled="navigating"
          class="px-2.5 py-1 text-xs font-medium text-white bg-stone-700 dark:bg-stone-600 rounded-md hover:bg-stone-800 dark:hover:bg-stone-500 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          @click="go"
        >Go</button>
      </div>
    </div>
    <div class="flex-1 p-4 bg-stone-100 dark:bg-stone-950 min-h-0">
      <iframe
        :srcdoc="srcdoc"
        class="w-full h-full bg-white rounded-lg border border-stone-200 dark:border-stone-700 shadow-xs"
      ></iframe>
    </div>
  </div>
</template>
