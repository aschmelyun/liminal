<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { usePhp } from '../composables/usePhp'
import { useTheme } from '../composables/useTheme'
import FileTree, { type TreeNode } from './FileTree.vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { php as phpLang } from '@codemirror/lang-php'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'

const { php, booted, vfsVersion, readFile, writeFile, collectVfsPaths } = usePhp()
const { isDark } = useTheme()

const editorThemeCompartment = new Compartment()

const tree = ref<TreeNode>({})
const currentFilePath = ref<string | null>(null)
const fileViewerPath = ref('Select a file')
const saveDisabled = ref(true)
const saveStatusText = ref('')
const saveStatusVisible = ref(false)

let editorView: EditorView | null = null
let savedContent = ''
const editorContainer = ref<HTMLDivElement | null>(null)

const EXT_LANG: Record<string, () => any> = {
  php: () => phpLang(),
  blade: () => phpLang(),
  html: () => html(),
  htm: () => html(),
  js: () => javascript(),
  mjs: () => javascript(),
  ts: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  json: () => json(),
  css: () => css(),
}

function getLangExtension(filePath: string) {
  const name = filePath.split('/').pop() || ''
  if (name.endsWith('.blade.php')) return EXT_LANG['blade']!()
  const ext = name.split('.').pop()!.toLowerCase()
  return EXT_LANG[ext]?.() ?? []
}

function buildTree(filePaths: string[]): TreeNode {
  const root: TreeNode = {}
  for (const fp of filePaths) {
    const rel = fp.startsWith('/app/') ? fp.slice(5) : fp
    const parts = rel.split('/')
    let node: TreeNode = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      if (i === parts.length - 1) {
        node[part] = null
      } else {
        if (!node[part] || typeof node[part] !== 'object') {
          node[part] = {}
        }
        node = node[part] as TreeNode
      }
    }
  }
  return root
}

function refreshFileTree() {
  const allPaths = collectVfsPaths('/app')
  tree.value = buildTree(allPaths)
}

function createEditor(content: string, langExt: any) {
  if (editorView) editorView.destroy()
  if (!editorContainer.value) return

  const saveKeymap = keymap.of([{
    key: 'Mod-s',
    run: () => { saveFile(); return true },
  }])

  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged || !currentFilePath.value) return
    const currentContent = update.state.doc.toString()
    const modified = currentContent !== savedContent
    saveDisabled.value = !modified
    if (modified) {
      saveStatusText.value = 'Modified'
      saveStatusVisible.value = true
    } else {
      saveStatusVisible.value = false
    }
  })

  const editorTheme = EditorView.theme({
    '&': { fontSize: '14px' },
    '.cm-content': { lineHeight: '1.7' },
    '.cm-gutters': { lineHeight: '1.7' },
  })

  const extensions = [
    basicSetup,
    editorTheme,
    saveKeymap,
    updateListener,
    EditorView.lineWrapping,
    editorThemeCompartment.of(isDark.value ? oneDark : []),
  ]

  if (langExt) {
    extensions.push(Array.isArray(langExt) ? langExt : langExt)
  }

  editorView = new EditorView({
    state: EditorState.create({
      doc: content,
      extensions,
    }),
    parent: editorContainer.value,
  })
}

function openFile(vfsPath: string) {
  if (!php.value) return
  try {
    const content = readFile(vfsPath)
    const relPath = vfsPath.startsWith('/app/') ? vfsPath.slice(5) : vfsPath

    currentFilePath.value = vfsPath
    savedContent = content
    fileViewerPath.value = relPath
    saveDisabled.value = true
    saveStatusVisible.value = false

    const langExt = getLangExtension(vfsPath)
    createEditor(content, langExt)
  } catch (err) {
    console.error('Failed to read file:', err)
  }
}

function saveFile() {
  if (!php.value || !currentFilePath.value || !editorView) return
  try {
    const content = editorView.state.doc.toString()
    writeFile(currentFilePath.value, content)
    savedContent = content
    saveDisabled.value = true
    saveStatusText.value = 'Saved'
    saveStatusVisible.value = true
    setTimeout(() => { saveStatusVisible.value = false }, 2000)
  } catch (err) {
    saveStatusText.value = 'Save failed'
    saveStatusVisible.value = true
    console.error('Failed to save file:', err)
  }
}

watch(isDark, (dark) => {
  editorView?.dispatch({
    effects: editorThemeCompartment.reconfigure(dark ? oneDark : []),
  })
})

watch(booted, (val) => {
  if (val) refreshFileTree()
})

watch(vfsVersion, () => {
  if (booted.value) refreshFileTree()
})

onMounted(() => {
  if (booted.value) refreshFileTree()
})

// Expose for agent to call
defineExpose({ openFile, refreshFileTree })
</script>

<template>
  <div class="flex-1 flex flex-col md:flex-row min-h-0">
    <!-- File tree -->
    <aside class="order-2 md:order-none h-44 md:h-auto w-full md:w-72 border-t md:border-t-0 md:border-r border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-y-auto shrink-0 flex flex-col">
      <div class="px-3 py-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <h2 class="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">Files</h2>
      </div>
      <div class="py-1 text-sm font-mono text-stone-600 dark:text-stone-300 flex-1 overflow-y-auto">
        <FileTree
          v-if="Object.keys(tree).length > 0"
          :tree="tree"
          @open-file="openFile"
        />
        <div v-else class="px-3 py-8 text-center text-xs text-stone-400 dark:text-stone-500">Waiting for boot...</div>
      </div>
    </aside>
    <!-- File editor -->
    <div class="flex-1 flex flex-col min-w-0 min-h-0 order-1 md:order-none">
      <div class="px-4 py-2 border-b border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0 flex items-center justify-between">
        <span class="text-xs font-mono text-stone-500 dark:text-stone-400">{{ fileViewerPath }}</span>
        <div class="flex items-center gap-2">
          <span v-show="saveStatusVisible" class="text-xs text-stone-400 dark:text-stone-500">{{ saveStatusText }}</span>
          <button
            :disabled="saveDisabled"
            class="px-2.5 py-1 text-xs font-medium text-white bg-stone-700 dark:bg-stone-600 rounded-md hover:bg-stone-800 dark:hover:bg-stone-500 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            @click="saveFile"
          >Save</button>
        </div>
      </div>
      <div ref="editorContainer" class="editor-container flex-1 min-h-0 overflow-hidden"></div>
    </div>
  </div>
</template>
