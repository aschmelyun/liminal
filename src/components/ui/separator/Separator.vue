<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  orientation?: 'horizontal' | 'vertical'
  class?: string
}>(), { orientation: 'horizontal' })

const classes = computed(() => cn(
  'shrink-0 bg-border',
  props.orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
  props.class,
))
</script>

<template><div :class="classes" role="separator" :aria-orientation="orientation" /></template>
