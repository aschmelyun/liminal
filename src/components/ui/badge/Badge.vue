<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'secondary' | 'outline'
  class?: string
}>(), { variant: 'default' })

const classes = computed(() => cn(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  props.variant === 'default' && 'border-transparent bg-primary text-primary-foreground',
  props.variant === 'secondary' && 'border-transparent bg-secondary text-secondary-foreground',
  props.variant === 'outline' && 'text-foreground',
  props.class,
))
</script>

<template><span :class="classes"><slot /></span></template>
