<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Boxes, Database, FileText, Github, MoreHorizontal } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import FileTree, { type TreeNode } from './FileTree.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const emit = defineEmits<{
  openFile: [path: string]
  openTools: []
}>()

const { booted, vfsVersion, collectVfsPaths } = usePhp()
const tree = ref<TreeNode>({})

function buildTree(filePaths: string[]): TreeNode {
  const root: TreeNode = {}
  for (const filePath of filePaths) {
    const relativePath = filePath.startsWith('/app/') ? filePath.slice(5) : filePath
    const parts = relativePath.split('/')
    let node = root
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        node[part] = null
      } else {
        if (!node[part] || typeof node[part] !== 'object') node[part] = {}
        node = node[part] as TreeNode
      }
    })
  }
  return root
}

function refreshTree() {
  if (booted.value) tree.value = buildTree(collectVfsPaths('/app'))
}

watch(booted, refreshTree)
watch(vfsVersion, refreshTree)
onMounted(refreshTree)
</script>

<template>
  <aside class="flex h-40 min-h-0 w-full shrink-0 flex-col border-b bg-background md:h-auto md:w-[220px] md:border-b-0">
    <div class="p-3">
      <Button variant="outline" class="w-full justify-start" size="sm">
        <Boxes />
        Sandbox
      </Button>
    </div>

    <Separator />

    <div class="flex items-center justify-between px-3 py-2">
      <span class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Files</span>
      <Button variant="ghost" size="icon" class="size-6" aria-label="File actions">
        <MoreHorizontal class="size-3.5" />
      </Button>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div v-if="Object.keys(tree).length" class="space-y-0.5 px-2 py-1 font-mono text-xs">
        <FileTree :tree="tree" @open-file="emit('openFile', $event)" />
      </div>
      <div v-else class="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-muted-foreground">
        <FileText class="size-4" />
        <span>Loading project files...</span>
      </div>
    </ScrollArea>

    <Separator />

    <div class="space-y-1 p-2">
      <Button variant="ghost" size="sm" class="w-full justify-start text-muted-foreground" @click="emit('openTools')">
        <Github />
        GitHub
      </Button>
      <Button variant="ghost" size="sm" class="w-full justify-start text-muted-foreground" @click="emit('openTools')">
        <Database />
        Database
      </Button>
    </div>
  </aside>
</template>
