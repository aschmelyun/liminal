<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { useWorkspace } from '../composables/useWorkspace'

const props = defineProps<{
  name: string
  path: string
  isDir: boolean
  depth: number
}>()

const emit = defineEmits<{ select: [] }>()

const { activeFilePath, collapseToken } = useWorkspace()

const open = ref(false)
const isActive = computed(() => !props.isDir && activeFilePath.value === props.path)

watch(collapseToken, () => { open.value = false })

function toggle() {
  if (props.isDir) open.value = !open.value
  else emit('select')
}
</script>

<template>
  <div>
    <button
      type="button"
      class="flex h-6 w-full items-center gap-1 rounded-sm pr-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      :class="isActive && 'bg-accent'"
      :style="{ paddingLeft: `${6 + depth * 12}px` }"
      @click="toggle"
    >
      <ChevronRight
        v-if="isDir"
        class="size-3 shrink-0 text-muted-foreground transition-transform duration-150"
        :class="open && 'rotate-90'"
      />
      <span v-else class="w-3 shrink-0" aria-hidden="true"></span>
      <span
        class="truncate"
        :class="isDir ? 'text-foreground' : isActive ? 'text-foreground' : 'text-muted-foreground'"
      >{{ name }}</span>
      <span v-if="isActive" class="ml-auto size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
    </button>

    <div v-if="isDir && open">
      <slot />
    </div>
  </div>
</template>
