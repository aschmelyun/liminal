<script setup lang="ts">
import { computed } from 'vue'
import FileTreeItem from './FileTreeItem.vue'

export interface TreeNode {
  [key: string]: TreeNode | null
}

const props = defineProps<{
  tree: TreeNode
  depth?: number
  parentPath?: string
}>()

const emit = defineEmits<{
  'open-file': [path: string]
}>()

const depth = computed(() => props.depth ?? 0)
const parentPath = computed(() => props.parentPath ?? '/app')

const sortedEntries = computed(() => {
  const entries = Object.entries(props.tree)
  const dirs = entries.filter(([, v]) => v !== null).sort(([a], [b]) => a.localeCompare(b))
  const files = entries.filter(([, v]) => v === null).sort(([a], [b]) => a.localeCompare(b))
  return [...dirs, ...files]
})
</script>

<template>
  <FileTreeItem
    v-for="[name, subtree] in sortedEntries"
    :key="name"
    :name="name"
    :is-dir="subtree !== null"
    :depth="depth"
    @select="emit('open-file', `${parentPath}/${name}`)"
  >
    <FileTree
      v-if="subtree !== null"
      :tree="subtree"
      :depth="depth + 1"
      :parent-path="`${parentPath}/${name}`"
      @open-file="emit('open-file', $event)"
    />
  </FileTreeItem>
</template>
