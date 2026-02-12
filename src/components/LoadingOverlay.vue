<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useGlyphs } from '../composables/useGlyphs'

const props = defineProps<{
  progress: number
  status: string
  failed: boolean
}>()

const { glyphText, start, stop } = useGlyphs()
const opacity = ref(1)
const pointerEvents = ref<'auto' | 'none'>('auto')

const pct = computed(() => Math.round(props.progress * 100))

onMounted(() => {
  start()
})

watch(() => props.progress, (val) => {
  if (val >= 1 && !props.failed) {
    setTimeout(() => {
      stop()
      opacity.value = 0
      pointerEvents.value = 'none'
    }, 400)
  }
})
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-stone-100 transition-opacity duration-500"
    :style="{ opacity, pointerEvents }"
  >
    <div
      class="absolute inset-0 overflow-hidden font-mono text-sm leading-5 text-stone-200 select-none whitespace-pre"
      aria-hidden="true"
    >{{ glyphText }}</div>
    <div
      class="relative bg-white rounded-2xl shadow-lg border border-stone-200 px-8 py-6 w-80 flex flex-col items-center gap-4"
      :class="{ 'border-red-300': failed }"
    >
      <span class="text-3xl text-stone-800" style="font-family: 'Jacquard 24', serif;">Liminal</span>
      <div class="w-full">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs text-stone-500">{{ status }}</span>
          <span v-if="progress > 0" class="text-xs font-mono text-stone-400">{{ pct }}%</span>
        </div>
        <div class="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            class="h-full bg-rose-500 rounded-full transition-all duration-200 ease-out"
            :style="{ width: `${pct}%` }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>
