<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { usePhp } from '../composables/usePhp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const { runArtisan, runComposerRequire } = usePhp()

const inputValue = ref('')
const running = ref(false)
const outputEl = ref<HTMLDivElement | null>(null)
const commandType = ref<'artisan' | 'composer'>('artisan')

const commandHistory: string[] = []
let historyIndex = -1

interface OutputEntry {
  html: string
}

const outputEntries = ref<OutputEntry[]>([
  { html: '<div class="text-stone-400">Laravel Terminal — use the dropdown to switch between Artisan and Composer modes.</div>' },
])

const placeholder = computed(() =>
  commandType.value === 'artisan' ? 'e.g. make:model Post' : 'e.g. spatie/laravel-sluggable'
)

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

  if (commandType.value === 'artisan') {
    appendOutput(`<div class="mt-3 text-stone-500">$ php artisan ${escapeHtml(trimmed)}</div>`)

    try {
      const { output, errors } = await runArtisan(trimmed)

      if (output) {
        appendOutput(`<pre class="text-stone-700 dark:text-stone-300 whitespace-pre-wrap">${escapeHtml(output)}</pre>`)
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
    }
  } else {
    appendOutput(`<div class="mt-3 text-stone-500">$ composer require ${escapeHtml(trimmed)}</div>`)
    appendOutput(`<div class="text-stone-400 italic">Fetching package info...</div>`)

    try {
      const { output, errors } = await runComposerRequire(trimmed)

      if (output) {
        appendOutput(`<pre class="text-stone-700 dark:text-stone-300 whitespace-pre-wrap">${escapeHtml(output)}</pre>`)
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
    }
  }

  running.value = false
  inputValue.value = ''
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
  <div class="flex min-h-0 flex-1 flex-col bg-zinc-950 text-xs text-zinc-300">
    <div ref="outputEl" class="flex-1 overflow-y-auto p-4 font-mono leading-6">
      <div v-for="(entry, i) in outputEntries" :key="i" v-html="entry.html"></div>
    </div>
    <div class="panel-terminal-input flex shrink-0 items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-4 pb-8 pt-3 md:py-3">
      <select
        v-model="commandType"
        class="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-1 font-mono text-xs text-zinc-400 outline-none focus:border-zinc-500"
      >
        <option value="artisan">php artisan</option>
        <option value="composer">composer require</option>
      </select>
      <Input
        v-model="inputValue"
        type="text"
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        :disabled="running"
        :placeholder="placeholder"
        class="h-8 flex-1 border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-zinc-500"
        @keydown="onKeydown"
      />
      <Button
        size="sm"
        :disabled="running"
        @click="run"
      >Run</Button>
    </div>
  </div>
</template>
