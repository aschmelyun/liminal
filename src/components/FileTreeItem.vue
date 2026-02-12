<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  name: string
  isDir: boolean
  depth: number
}>()

const emit = defineEmits<{
  select: []
}>()

const open = ref(false)

function toggle() {
  if (props.isDir) {
    open.value = !open.value
  } else {
    emit('select')
  }
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-1.5 px-3 py-0.5 cursor-pointer hover:bg-stone-50 select-none"
      :style="{ paddingLeft: `${12 + depth * 16}px` }"
      @click.stop="toggle"
    >
      <!-- Chevron (dirs only) -->
      <svg
        v-if="isDir"
        class="w-3 h-3 shrink-0 transition-transform duration-150"
        :class="{ 'rotate-90': open }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ><polyline points="9 18 15 12 9 6"/></svg>
      <!-- Spacer for files -->
      <span v-else class="w-3 shrink-0"></span>

      <!-- Icon -->
      <svg
        v-if="isDir"
        class="w-4 h-4 shrink-0 text-stone-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <svg
        v-else
        class="w-4 h-4 shrink-0 text-stone-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>

      <!-- Label -->
      <span
        class="truncate"
        :class="isDir ? 'text-stone-700' : 'text-stone-600'"
      >{{ name }}</span>
    </div>

    <!-- Children slot (shown when open) -->
    <div v-if="isDir && open">
      <slot />
    </div>
  </div>
</template>
