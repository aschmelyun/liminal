<script setup lang="ts">
import { ref } from 'vue'
import { CircleDot, MoreHorizontal, Play, RotateCcw } from 'lucide-vue-next'
import HelpModal from './HelpModal.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const helpOpen = ref(false)
const menuOpen = ref(false)

const emit = defineEmits<{
  run: []
  reset: []
  openAgent: []
}>()
</script>

<template>
  <header class="relative flex h-14 shrink-0 items-center border-b bg-background px-4">
    <div class="flex min-w-0 items-center gap-3">
      <div class="grid size-8 place-items-center rounded-md border bg-muted font-mono text-xs font-bold">L/</div>
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="truncate text-sm font-semibold">liminal</span>
          <Badge variant="outline" class="h-5 rounded-sm px-1.5 font-mono text-[10px]">main</Badge>
        </div>
        <div class="truncate text-xs text-muted-foreground">Browser PHP sandbox</div>
      </div>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <div class="mr-2 hidden items-center gap-2 text-xs text-muted-foreground md:flex">
        <CircleDot class="size-3 fill-emerald-500 text-emerald-500" />
        PHP 8.4 · running
      </div>
      <Button variant="outline" size="sm" @click="emit('reset')">
        <RotateCcw />
        Reset
      </Button>
      <Button size="sm" @click="emit('run')">
        <Play />
        Run
      </Button>
      <Button variant="ghost" size="icon" class="size-8" aria-label="More actions" @click="menuOpen = !menuOpen">
        <MoreHorizontal />
      </Button>
    </div>

    <div v-if="menuOpen" class="absolute right-4 top-12 z-20 w-36 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
      <button class="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent" @click="emit('openAgent'); menuOpen = false">Open Agent</button>
      <button class="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent" @click="helpOpen = true; menuOpen = false">Help</button>
    </div>
  </header>

  <HelpModal v-if="helpOpen" @close="helpOpen = false" />
</template>
