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

const MODES: { value: Mode; label: string; prefix: string; placeholder: string; hint: string }[] = [
  {
    value: 'artisan',
    label: 'Artisan',
    prefix: 'php artisan',
    placeholder: 'make:model Post -m',
    hint: 'Run Artisan commands against the sandbox. ↑/↓ walks your history.',
  },
  {
    value: 'composer',
    label: 'Composer',
    prefix: 'composer require',
    placeholder: 'spatie/laravel-sluggable',
    hint: 'Pull a Composer package into the sandbox. ↑/↓ walks your history.',
  },
]

/** Each mode keeps its own transcript, draft command, history and scroll spot. */
interface Buffer {
  lines: Line[]
  input: string
  history: string[]
  historyIndex: number
  scrollTop: number
}

function createBuffer(): Buffer {
  return { lines: [], input: '', history: [], historyIndex: 0, scrollTop: 0 }
}

const mode = ref<Mode>('artisan')
const running = ref(false)
// Which transcript the in-flight command belongs to — it may not be on screen.
const runningMode = ref<Mode | null>(null)
const outputEl = ref<HTMLDivElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const buffers = ref<Record<Mode, Buffer>>({ artisan: createBuffer(), composer: createBuffer() })

const buffer = computed(() => buffers.value[mode.value])
const activeMode = computed(() => modeConfig(mode.value))

function modeConfig(value: Mode) {
  return MODES.find(option => option.value === value)!
}

function scrollToBottom() {
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}

function switchMode(next: Mode) {
  if (next === mode.value) return
  buffer.value.scrollTop = outputEl.value?.scrollTop ?? 0
  mode.value = next
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = buffer.value.scrollTop
    inputEl.value?.focus()
  })
}

function append(target: Mode, kind: LineKind, text: string) {
  if (!text) return
  buffers.value[target].lines.push({ kind, text })
  // A background command must not yank the transcript you are reading.
  if (target === mode.value) scrollToBottom()
}

async function run() {
  const target = mode.value
  const active = buffers.value[target]
  const command = active.input.trim()
  if (running.value || !command) return

  running.value = true
  runningMode.value = target
  active.history.push(command)
  active.historyIndex = active.history.length
  active.input = ''
  append(target, 'command', `${modeConfig(target).prefix} ${command}`)

  try {
    const { output, errors } = target === 'artisan'
      ? await runArtisan(command)
      : await runComposerRequire(command, line => append(target, 'output', line))

    append(target, 'output', output.trimEnd())
    append(target, 'error', errors.trimEnd())
    if (!output && !errors) append(target, 'note', 'Command completed with no output.')
  } catch (err: any) {
    append(target, 'error', err.message)
    console.error(err)
  } finally {
    running.value = false
    runningMode.value = null
    nextTick(() => inputEl.value?.focus())
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') return run()

  const active = buffer.value

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (active.historyIndex > 0) active.input = active.history[--active.historyIndex]!
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (active.historyIndex < active.history.length - 1) {
      active.input = active.history[++active.historyIndex]!
    } else {
      active.historyIndex = active.history.length
      active.input = ''
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
          class="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors"
          :class="mode === option.value
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground'"
          @click="switchMode(option.value)"
        >
          {{ option.label }}
          <span
            v-if="runningMode === option.value"
            class="size-1.5 animate-pulse rounded-full bg-brand"
            :aria-label="`${option.label} command running`"
          ></span>
        </button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="ml-auto h-7"
        :disabled="!buffer.lines.length"
        @click="buffer.lines = []"
      >
        <Eraser class="size-3.5" />
        Clear
      </Button>
    </div>

    <div ref="outputEl" class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 font-mono text-xs leading-6">
      <p v-if="!buffer.lines.length" class="text-muted-foreground/70">
        {{ activeMode.hint }}
      </p>

      <template v-for="(line, i) in buffer.lines" :key="i">
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
        v-model="buffer.input"
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
      <Button size="sm" class="h-7 shrink-0" :disabled="running || !buffer.input.trim()" @click="run">
        {{ running ? 'Running…' : 'Run' }}
      </Button>
    </div>
  </div>
</template>
