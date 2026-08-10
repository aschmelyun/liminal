<script setup lang="ts">
import { Bot, Code2, Database, Github, Monitor, Moon, Settings, SquareTerminal, Sun } from 'lucide-vue-next'
import { useTheme } from '../composables/useTheme'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { REPO_URL } from '../lib/links'
import type { WorkspaceTab } from '../lib/tabs'

defineProps<{ modelValue: WorkspaceTab }>()
defineEmits<{ 'update:modelValue': [value: WorkspaceTab]; openSettings: [] }>()

const { isDark, setTheme } = useTheme()

const TABS = [
  { value: 'preview', label: 'Preview', icon: Monitor },
  { value: 'code', label: 'Code', icon: Code2 },
  { value: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { value: 'database', label: 'Database', icon: Database },
  { value: 'agent', label: 'Agent', icon: Bot },
] as const
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-2 border-b bg-panel pl-3 pr-2">
    <div class="flex shrink-0 items-center gap-2.5">
      <div class="grid size-6 shrink-0 place-items-center rounded bg-brand text-2xl text-brand-foreground" style="font-family: 'Jacquard 24', serif;">L</div>
      <span class="hidden text-sm font-semibold tracking-tight sm:inline">liminal</span>
    </div>

    <Tabs
      :model-value="modelValue"
      class="mx-auto min-w-0"
      @update:model-value="$emit('update:modelValue', $event as WorkspaceTab)"
    >
      <TabsList class="h-8 gap-0.5">
        <TabsTrigger
          v-for="tab in TABS"
          :key="tab.value"
          :value="tab.value"
          class="gap-1.5 px-2 text-xs md:px-2.5"
          :aria-label="tab.label"
        >
          <component :is="tab.icon" class="size-3.5" />
          <span class="hidden md:inline">{{ tab.label }}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <div class="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="setTheme(isDark ? 'light' : 'dark')"
      >
        <Sun v-if="isDark" class="size-4" />
        <Moon v-else class="size-4" />
      </Button>
      <a
        :href="REPO_URL"
        target="_blank"
        rel="noreferrer"
        aria-label="Liminal on GitHub"
        class="hidden size-8 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
      >
        <Github class="size-4" />
      </a>
      <Button variant="ghost" size="icon" class="size-8" aria-label="Settings" @click="$emit('openSettings')">
        <Settings class="size-4" />
      </Button>
    </div>
  </header>
</template>
