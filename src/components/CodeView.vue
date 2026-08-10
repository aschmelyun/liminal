<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FileCode2, Save } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { useTheme } from '../composables/useTheme'
import { useWorkspace } from '../composables/useWorkspace'
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
const { activeFilePath } = useWorkspace()

const syntaxCompartment = new Compartment()

const dirty = ref(false)
const saveNotice = ref('')
const saveFailed = ref(false)

let editorView: EditorView | null = null
let savedContent = ''
const editorContainer = ref<HTMLDivElement | null>(null)

const relativePath = computed(() => activeFilePath.value?.replace(/^\/app\//, '') ?? '')

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

/*
 * Sits on top of the syntax theme so the editor chrome (background, gutters,
 * selection, caret) tracks the app's design tokens in both themes.
 */
const chromeTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-content': { lineHeight: '1.7', caretColor: 'var(--foreground)' },
  '.cm-gutters': {
    lineHeight: '1.7',
    backgroundColor: 'var(--background)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--foreground) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--brand) 28%, transparent)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--brand)' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--foreground)' },
})

function createEditor(content: string, langExt: any) {
  editorView?.destroy()
  if (!editorContainer.value) return

  editorView = new EditorView({
    state: EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        langExt,
        keymap.of([{ key: 'Mod-s', run: () => { saveFile(); return true } }]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          dirty.value = update.state.doc.toString() !== savedContent
          saveNotice.value = ''
        }),
        EditorView.lineWrapping,
        syntaxCompartment.of(isDark.value ? oneDark : []),
        chromeTheme,
      ],
    }),
    parent: editorContainer.value,
  })
}

function openFile(vfsPath: string) {
  if (!php.value) return
  try {
    const content = readFile(vfsPath)
    activeFilePath.value = vfsPath
    savedContent = content
    dirty.value = false
    saveNotice.value = ''
    saveFailed.value = false
    createEditor(content, getLangExtension(vfsPath))
  } catch (err) {
    console.error('Failed to read file:', err)
  }
}

function saveFile() {
  if (!activeFilePath.value || !editorView) return
  try {
    const content = editorView.state.doc.toString()
    writeFile(activeFilePath.value, content)
    savedContent = content
    dirty.value = false
    saveFailed.value = false
    saveNotice.value = 'Saved'
    setTimeout(() => { if (saveNotice.value === 'Saved') saveNotice.value = '' }, 2000)
  } catch (err) {
    saveFailed.value = true
    saveNotice.value = 'Save failed'
    console.error('Failed to save file:', err)
  }
}

watch(isDark, (dark) => {
  editorView?.dispatch({ effects: syntaxCompartment.reconfigure(dark ? oneDark : []) })
})

function openDefaultFile() {
  if (activeFilePath.value || !php.value) return
  const preferred = '/app/resources/views/welcome.blade.php'
  if (fileExists(preferred)) openFile(preferred)
}

watch(booted, (ready) => { if (ready) openDefaultFile() })
onMounted(openDefaultFile)

defineExpose({ openFile })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b bg-panel px-2">
      <FileCode2 class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 truncate font-mono text-xs" :title="relativePath">
        {{ relativePath || 'No file open' }}
      </span>
      <span
        v-if="dirty"
        class="size-1.5 shrink-0 rounded-full bg-brand"
        title="Unsaved changes"
        aria-label="Unsaved changes"
      ></span>

      <div class="ml-auto flex shrink-0 items-center gap-2">
        <span
          v-if="saveNotice"
          class="text-xs"
          :class="saveFailed ? 'text-destructive' : 'text-muted-foreground'"
        >{{ saveNotice }}</span>
        <Button size="sm" class="h-7" :disabled="!dirty" @click="saveFile">
          <Save class="size-3.5" />
          Save
        </Button>
      </div>
    </div>

    <div v-show="activeFilePath" ref="editorContainer" class="editor-container min-h-0 flex-1 overflow-hidden bg-background"></div>

    <div v-if="!activeFilePath" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
      <FileCode2 class="size-5" />
      <p>Pick a file from the explorer to start editing.</p>
    </div>
  </div>
</template>
