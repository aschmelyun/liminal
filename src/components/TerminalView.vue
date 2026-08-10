<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Eraser } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { Button } from '@/components/ui/button'

const { runArtisan, runComposerRequire } = usePhp()

type Mode = 'artisan' | 'composer'
type LineKind = 'command' | 'output' | 'error' | 'note'

interface Line {
  kind: LineKind
  text: string
}

const MODES: { value: Mode; label: string; prefix: string; placeholder: string }[] = [
  { value: 'artisan', label: 'Artisan', prefix: 'php artisan', placeholder: 'make:model Post -m' },
  { value: 'composer', label: 'Composer', prefix: 'composer require', placeholder: 'spatie/laravel-sluggable' },
]

const mode = ref<Mode>('artisan')
const input = ref('')
const running = ref(false)
const outputEl = ref<HTMLDivElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const lines = ref<Line[]>([])

const history: string[] = []
let historyIndex = -1

const activeMode = computed(() => MODES.find(m => m.value === mode.value)!)

function append(kind: LineKind, text: string) {
  if (!text) return
  lines.value.push({ kind, text })
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}

async function run() {
  const command = input.value.trim()
  if (running.value || !command) return

  running.value = true
  history.push(command)
  historyIndex = history.length
  input.value = ''
  append('command', `${activeMode.value.prefix} ${command}`)

  try {
    const { output, errors } = mode.value === 'artisan'
      ? await runArtisan(command)
      : await runComposerRequire(command, line => append('output', line))

    append('output', output.trimEnd())
    append('error', errors.trimEnd())
    if (!output && !errors) append('note', 'Command completed with no output.')
  } catch (err: any) {
    append('error', err.message)
    console.error(err)
  } finally {
    running.value = false
    nextTick(() => inputEl.value?.focus())
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') return run()

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (historyIndex > 0) input.value = history[--historyIndex]!
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (historyIndex < history.length - 1) {
      input.value = history[++historyIndex]!
    } else {
      historyIndex = history.length
      input.value = ''
    }
  }
}

const KIND_CLASS: Record<LineKind, string> = {
  command: 'text-foreground',
  output: 'text-muted-foreground',
  error: 'text-destructive',
  note: 'text-muted-foreground/70 italic',
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b bg-panel px-2">
      <div class="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
        <button
          v-for="option in MODES"
          :key="option.value"
          type="button"
          class="rounded px-2 py-1 text-xs font-medium transition-colors"
          :class="mode === option.value
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground'"
          @click="mode = option.value"
        >{{ option.label }}</button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="ml-auto h-7"
        :disabled="!lines.length"
        @click="lines = []"
      >
        <Eraser class="size-3.5" />
        Clear
      </Button>
    </div>

    <div ref="outputEl" class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 font-mono text-xs leading-6">
      <p v-if="!lines.length" class="text-muted-foreground/70">
        Run Artisan commands or pull a Composer package into the sandbox. ↑/↓ walks your history.
      </p>

      <template v-for="(line, i) in lines" :key="i">
        <div v-if="line.kind === 'command'" class="mt-3 flex gap-1.5 first:mt-0">
          <span class="shrink-0 select-none text-brand">$</span>
          <span class="whitespace-pre-wrap break-all text-foreground">{{ line.text }}</span>
        </div>
        <pre v-else class="whitespace-pre-wrap break-words" :class="KIND_CLASS[line.kind]">{{ line.text }}</pre>
      </template>
    </div>

    <div class="safe-bottom flex shrink-0 items-center gap-2 border-t bg-panel px-3 py-2">
      <span class="shrink-0 select-none font-mono text-xs text-muted-foreground">{{ activeMode.prefix }}</span>
      <input
        ref="inputEl"
        v-model="input"
        type="text"
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        :disabled="running"
        :placeholder="activeMode.placeholder"
        :aria-label="`${activeMode.prefix} arguments`"
        class="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
        @keydown="onKeydown"
      />
      <Button size="sm" class="h-7 shrink-0" :disabled="running || !input.trim()" @click="run">
        {{ running ? 'Running…' : 'Run' }}
      </Button>
    </div>
  </div>
</template>
