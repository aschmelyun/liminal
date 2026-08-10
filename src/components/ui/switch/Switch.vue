<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  defaultChecked?: boolean
  class?: string
}>(), { modelValue: undefined, defaultChecked: false })

defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const classes = computed(() => cn(
  'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
  props.class,
))
</script>

<template>
  <SwitchRoot
    v-bind="attrs"
    :model-value="modelValue"
    :default-checked="defaultChecked"
    :class="classes"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SwitchThumb class="pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
  </SwitchRoot>
</template>
