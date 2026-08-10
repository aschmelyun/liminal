<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useGlyphs } from '../composables/useGlyphs'

const props = defineProps<{
  progress: number
  status: string
  log: string[]
  failed: boolean
}>()

const { glyphText, start, stop } = useGlyphs()
const opacity = ref(1)
const pointerEvents = ref<'auto' | 'none'>('auto')

const pct = computed(() => Math.round(props.progress * 100))

// Newest first: the stream reads top-down, older paths sink and fade out.
const stream = computed(() => [...props.log].reverse())

onMounted(start)

watch(() => props.progress, (val) => {
  if (val < 1 || props.failed) return
  setTimeout(() => {
    stop()
    opacity.value = 0
    pointerEvents.value = 'none'
  }, 400)
})

watch(() => props.failed, (failed) => {
  if (failed) stop()
})
</script>

<template>
  <div
    class="fixed inset-0 z-100 flex items-center justify-center bg-panel transition-opacity duration-500"
    :style="{ opacity, pointerEvents }"
  >
    <div
      class="pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre font-mono text-sm leading-5 text-foreground/[0.06]"
      aria-hidden="true"
    >{{ glyphText }}</div>

    <div
      class="relative flex w-[24rem] max-w-[calc(100vw-2rem)] flex-col rounded-xl border bg-background shadow-lg"
      :class="failed && 'border-destructive/50'"
    >
      <div class="px-6 pt-6">
        <div class="flex items-baseline justify-between">
          <span class="text-3xl leading-none text-foreground" style="font-family: 'Jacquard 24', serif;">Liminal</span>
          <span class="font-mono text-[11px] text-muted-foreground">PHP 8.4 · WASM</span>
        </div>
      </div>

      <div class="px-6 pt-5">
        <div class="mb-2 flex items-baseline justify-between gap-3">
          <span
            class="truncate text-xs"
            :class="failed ? 'text-destructive' : 'text-muted-foreground'"
          >{{ failed ? 'Boot failed — check the browser console' : status }}</span>
          <span v-if="progress > 0 && !failed" class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{{ pct }}%</span>
        </div>
        <div class="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full transition-[width] duration-200 ease-out"
            :class="failed ? 'bg-destructive' : 'bg-brand'"
            :style="{ width: `${failed ? 100 : pct}%` }"
          ></div>
        </div>
      </div>

      <!-- Files streaming into the virtual filesystem, newest at the top. -->
      <div
        class="relative h-[240px] overflow-hidden px-6 pb-5 pt-3"
        aria-hidden="true"
      >
        <div class="boot-log flex h-full flex-col font-mono text-[11px] leading-[21px] text-muted-foreground">
          <div v-for="(line, i) in stream" :key="i" class="truncate">{{ line }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.boot-log {
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 25%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 0%, black 25%, transparent 100%);
}
</style>
