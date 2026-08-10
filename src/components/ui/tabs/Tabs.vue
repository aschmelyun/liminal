<script setup lang="ts">
import { TabsRoot } from 'reka-ui'
import { useAttrs } from 'vue'

const attrs = useAttrs()
defineProps<{ modelValue?: string; defaultValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <TabsRoot v-bind="attrs" :model-value="modelValue" :default-value="defaultValue" @update:model-value="emit('update:modelValue', $event)">
    <slot />
  </TabsRoot>
</template>
