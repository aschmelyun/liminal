<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { usePhp } from '../composables/usePhp'

const { runArtisan, collectVfsPaths } = usePhp()

const inputValue = ref('')
const running = ref(false)
const outputEl = ref<HTMLDivElement | null>(null)

const commandHistory: string[] = []
let historyIndex = -1

interface OutputEntry {
  html: string
}

const outputEntries = ref<OutputEntry[]>([
  { html: '<div class="text-stone-400">Laravel Artisan — type a command below to run it.</div>' },
])

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function appendOutput(html: string) {
  outputEntries.value.push({ html })
  nextTick(() => {
    if (outputEl.value) {
      outputEl.value.scrollTop = outputEl.value.scrollHeight
    }
  })
}

async function run() {
  if (running.value) return
  const trimmed = inputValue.value.trim()
  if (!trimmed) return

  running.value = true
  commandHistory.push(trimmed)
  historyIndex = commandHistory.length

  appendOutput(`<div class="mt-3 text-stone-500">$ php artisan ${escapeHtml(trimmed)}</div>`)

  try {
    const { output, errors } = await runArtisan(trimmed)

    if (output) {
      appendOutput(`<pre class="text-stone-700 whitespace-pre-wrap">${escapeHtml(output)}</pre>`)
    }
    if (errors) {
      appendOutput(`<pre class="text-red-600 whitespace-pre-wrap">${escapeHtml(errors)}</pre>`)
    }
    if (!output && !errors) {
      appendOutput(`<div class="text-stone-400 italic">Command completed with no output.</div>`)
    }
  } catch (err: any) {
    appendOutput(`<pre class="text-red-600 whitespace-pre-wrap">${escapeHtml(err.message)}</pre>`)
    console.error(err)
  } finally {
    running.value = false
    inputValue.value = ''
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    run()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (historyIndex > 0) {
      historyIndex--
      inputValue.value = commandHistory[historyIndex]!
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++
      inputValue.value = commandHistory[historyIndex]!
    } else {
      historyIndex = commandHistory.length
      inputValue.value = ''
    }
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div ref="outputEl" class="flex-1 overflow-y-auto p-4 font-mono text-sm">
      <div v-for="(entry, i) in outputEntries" :key="i" v-html="entry.html"></div>
    </div>
    <div class="panel-terminal-input border-t border-stone-200 bg-white px-4 pt-3 pb-8 md:py-3 shrink-0 flex items-center gap-2">
      <span class="text-xs font-mono text-stone-400 shrink-0">php artisan</span>
      <input
        v-model="inputValue"
        type="text"
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        :disabled="running"
        placeholder="e.g. make:model Post"
        class="flex-1 px-2 py-1 text-sm font-mono bg-stone-50 border border-stone-200 rounded-md text-stone-700 outline-none focus:border-stone-400 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
        @keydown="onKeydown"
      />
      <button
        :disabled="running"
        class="px-2.5 py-1 text-xs font-medium text-white bg-stone-700 rounded-md hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        @click="run"
      >Run</button>
    </div>
  </div>
</template>
