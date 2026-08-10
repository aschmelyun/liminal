<script setup lang="ts">
import { ref, watch } from 'vue'
import { ExternalLink, RotateCw } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { Button } from '@/components/ui/button'
import RouteCombobox from './RouteCombobox.vue'

const { navigateTo, booted } = usePhp()

const route = ref('/')
const loading = ref(false)
const error = ref('')
const srcdoc = ref('')
const lastHtml = ref('')

const TAILWIND_CDN = '<script src="https://unpkg.com/@tailwindcss/browser@4"><\/script>'

function injectTailwind(html: string): string {
  return html.includes('<head>')
    ? html.replace('<head>', `<head>${TAILWIND_CDN}`)
    : TAILWIND_CDN + html
}

async function go() {
  if (loading.value) return
  loading.value = true
  error.value = ''

  try {
    const html = await navigateTo(route.value || '/')
    lastHtml.value = html ? injectTailwind(html) : ''
    srcdoc.value = lastHtml.value
    if (!html) error.value = `${route.value} returned an empty response.`
  } catch (err: any) {
    error.value = err.message || 'Request failed'
    console.error(err)
  } finally {
    loading.value = false
  }
}

/** Picked from the route dropdown — v-model has already landed, so just load it. */
function goTo(uri: string) {
  route.value = uri
  go()
}

/** Pop the rendered response into a real tab so it can be inspected normally. */
function openInNewTab() {
  if (!lastHtml.value) return
  const url = URL.createObjectURL(new Blob([lastHtml.value], { type: 'text/html' }))
  window.open(url, '_blank', 'noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

watch(booted, (ready) => { if (ready) go() }, { immediate: true })

defineExpose({ refresh: go })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-1.5 border-b bg-panel px-2">
      <form class="flex min-w-0 flex-1 items-center gap-1.5" @submit.prevent="go">
        <RouteCombobox v-model="route" :disabled="!booted" @select="goTo" />
        <Button type="submit" variant="ghost" size="icon" class="size-7" :disabled="loading" aria-label="Reload route">
          <RotateCw class="size-3.5" :class="loading && 'animate-spin'" />
        </Button>
      </form>

      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :disabled="!lastHtml"
        aria-label="Open rendered page in a new tab"
        @click="openInNewTab"
      >
        <ExternalLink class="size-3.5" />
      </Button>
    </div>

    <div class="relative min-h-0 flex-1">
      <iframe
        v-show="!error"
        :srcdoc="srcdoc"
        title="Laravel application preview"
        class="size-full border-0 bg-white"
      ></iframe>

      <div v-if="error" class="flex size-full items-center justify-center p-6">
        <div class="w-full max-w-lg rounded-lg border border-destructive/40 bg-background p-4">
          <p class="text-sm font-medium text-destructive">Request failed</p>
          <pre class="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">{{ error }}</pre>
        </div>
      </div>

      <div
        v-if="loading"
        class="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-brand/20"
      >
        <div class="h-full w-1/3 animate-[preview-scan_1.1s_ease-in-out_infinite] bg-brand"></div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes preview-scan {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
</style>
