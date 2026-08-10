<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'ghost' | 'secondary'
type Size = 'default' | 'sm' | 'icon'

const props = withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  class?: string
}>(), {
  variant: 'default',
  size: 'default',
})

const attrs = useAttrs()
const classes = computed(() => cn(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90': props.variant === 'default',
    'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground': props.variant === 'outline',
    'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80': props.variant === 'secondary',
    'hover:bg-accent hover:text-accent-foreground': props.variant === 'ghost',
  },
  {
    'h-9 px-4 py-2': props.size === 'default',
    'h-8 rounded-md px-3 text-xs': props.size === 'sm',
    'size-9': props.size === 'icon',
  },
  props.class,
))
</script>

<template>
  <button v-bind="attrs" :class="classes" type="button">
    <slot />
  </button>
</template>
