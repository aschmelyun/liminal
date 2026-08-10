<script setup lang="ts">
import { TabsContent } from 'reka-ui'
import { cn } from '@/lib/utils'

defineProps<{ value: string; class?: string }>()
</script>

<template><TabsContent :value="value" :class="cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', $props.class)"><slot /></TabsContent></template>
