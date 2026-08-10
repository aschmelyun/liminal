<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePhp } from '../composables/usePhp'
import { ExternalLink } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

defineExpose({ refresh: go })
</script>

<template>
  <div class="min-h-0 flex-1 bg-muted/30 p-3">
    <div class="flex h-full min-h-[300px] flex-col overflow-hidden rounded-lg border bg-muted/40">
      <div class="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-3">
        <div class="size-2 rounded-full bg-muted-foreground/30" />
        <div class="size-2 rounded-full bg-muted-foreground/30" />
        <div class="size-2 rounded-full bg-muted-foreground/30" />
        <div class="ml-2 flex min-w-0 flex-1 items-center gap-1.5">
          <Input
          v-model="routeInput"
          type="text"
          spellcheck="false"
          class="h-7 min-w-0 flex-1 bg-muted font-mono text-[10px]"
          :disabled="navigating"
          @keydown="onKeydown"
          />
          <Button
          variant="ghost"
          size="icon"
          class="size-7"
          aria-label="Open preview in a new tab"
          :disabled="navigating"
          @click="go"
          >
            <ExternalLink class="size-3.5" />
          </Button>
        </div>
        <Button
          size="sm"
          :disabled="navigating"
          @click="go"
        >{{ navigating ? 'Loading' : 'Run' }}</Button>
      </div>
      <iframe
        :srcdoc="srcdoc"
        title="Laravel application preview"
        class="min-h-0 w-full flex-1 border-0 bg-white"
      ></iframe>
    </div>
  </div>
</template>
