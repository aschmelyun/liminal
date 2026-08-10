<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { usePhp } from '../composables/usePhp'
import { useTheme } from '../composables/useTheme'
import { Button } from '@/components/ui/button'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { php as phpLang } from '@codemirror/lang-php'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'

const { php, booted, readFile, writeFile, fileExists } = usePhp()
const { isDark } = useTheme()

const editorThemeCompartment = new Compartment()

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

function openDefaultFile() {
  if (currentFilePath.value || !php.value) return
  const preferred = '/app/resources/views/welcome.blade.php'
  if (fileExists(preferred)) {
    openFile(preferred)
  }
}

watch(booted, (val) => {
  if (val) openDefaultFile()
})

onMounted(openDefaultFile)

// Expose for agent to call
defineExpose({ openFile })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center justify-between border-b bg-background px-3 py-2">
        <span class="text-xs font-mono text-stone-500 dark:text-stone-400">{{ fileViewerPath }}</span>
        <div class="flex items-center gap-2">
          <span v-show="saveStatusVisible" class="text-xs text-stone-400 dark:text-stone-500">{{ saveStatusText }}</span>
          <Button size="sm" :disabled="saveDisabled" @click="saveFile">Save</Button>
        </div>
    </div>
    <div ref="editorContainer" class="editor-container min-h-0 flex-1 overflow-hidden bg-background"></div>
  </div>
</template>
