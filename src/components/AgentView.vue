<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ArrowUp, Bot, Eraser, KeyRound } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { MODEL_OPTIONS, useAgentSettings } from '../composables/useAgentSettings'
import { Button } from '@/components/ui/button'

const {
  readFile, writeFile, listFiles, fileExists, isDir, mkdir, runArtisan,
} = usePhp()

const { apiKey, model } = useAgentSettings()

const emit = defineEmits<{ openSettings: [] }>()

type EntryRole = 'user' | 'assistant' | 'tool' | 'error' | 'usage'

interface Entry {
  role: EntryRole
  /** Plain text for user/tool/error/usage; rendered markdown HTML for assistant. */
  body: string
  label?: string
}

const entries = ref<Entry[]>([])
const input = ref('')
const running = ref(false)
const outputEl = ref<HTMLDivElement | null>(null)

const hasKey = computed(() => apiKey.value.trim().length > 0)
const started = computed(() => entries.value.length > 0)

let conversation: any[] = []

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(text: string) {
  let out = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
    let highlighted = escapeHtml(code.trimEnd())
    if (lang && (self as any).hljs) {
      try {
        highlighted = (self as any).hljs.highlight(code.trimEnd(), { language: lang, ignoreIllegals: true }).value
      } catch { /* fall back to the escaped source */ }
    }
    return `<pre><code class="${lang ? `hljs language-${lang}` : ''}">${highlighted}</code></pre>`
  })
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  return out
}

function append(role: EntryRole, body: string, label?: string) {
  entries.value.push({ role, body, label })
  scrollToBottom()
}

function scrollToBottom() {
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Path is relative to the Laravel project root (e.g. "routes/web.php").',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to project root' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: "Write content to a file, creating it if it doesn't exist. Parent directories are created automatically. Path is relative to the Laravel project root.",
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in a directory. Path is relative to the Laravel project root. Use "" or "." for the root.',
      parameters: {
        type: 'object',
        properties: { directory: { type: 'string', description: 'Directory path relative to project root' } },
        required: ['directory'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_artisan',
      description: 'Run a Laravel Artisan command. Do not include "php artisan" prefix — just the command and arguments (e.g. "make:model Post -m").',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Artisan command to run (without "php artisan" prefix)' } },
        required: ['command'],
      },
    },
  },
]

async function executeAgentTool(name: string, args: any): Promise<string> {
  const base = '/app'

  if (name === 'read_file') {
    try {
      return readFile(`${base}/${args.path}`)
    } catch {
      return `Error: file not found — ${args.path}`
    }
  }

  if (name === 'write_file') {
    const vfsPath = `${base}/${args.path}`
    try {
      const parts = vfsPath.split('/').slice(1, -1)
      let dir = ''
      for (const part of parts) {
        dir += '/' + part
        if (!fileExists(dir)) mkdir(dir)
      }
      writeFile(vfsPath, args.content)
      return `File written: ${args.path}`
    } catch (e: any) {
      return `Error writing file: ${e.message}`
    }
  }

  if (name === 'list_files') {
    const dir = args.directory && args.directory !== '.' ? `${base}/${args.directory}` : base
    try {
      return listFiles(dir)
        .map((entry: string) => (isDir(`${dir}/${entry}`) ? `${entry}/` : entry))
        .join('\n')
    } catch (e: any) {
      return `Error listing directory: ${e.message}`
    }
  }

  if (name === 'run_artisan') {
    try {
      const { output, errors } = await runArtisan(args.command)
      return (output + (errors ? '\nSTDERR:\n' + errors : '')) || 'Command completed with no output.'
    } catch (e: any) {
      return `Error running artisan: ${e.message}`
    }
  }

  return `Unknown tool: ${name}`
}

const EXCLUDED_TREE_DIRS = new Set(['vendor', 'node_modules', '.git', 'storage'])

function collectProjectTree(dir: string, depth = 0): string[] {
  const out: string[] = []
  try {
    for (const name of listFiles(dir)) {
      const full = `${dir}/${name}`
      if (!isDir(full)) {
        out.push(name)
        continue
      }
      if (depth === 0 && EXCLUDED_TREE_DIRS.has(name)) {
        out.push(`${name}/  (excluded)`)
        continue
      }
      out.push(`${name}/`)
      if (depth < 3) out.push(...collectProjectTree(full, depth + 1).map(l => '  ' + l))
    }
  } catch { /* unreadable directory */ }
  return out
}

function buildSystemPrompt() {
  return `You are an AI assistant embedded in Liminal, a browser-based Laravel 12 IDE running PHP 8.4 via WebAssembly.

Environment:
- Laravel 12 with PHP 8.4 (compiled to WASM, runs entirely in the browser)
- SQLite database at database/database.sqlite
- No network access from PHP — no external HTTP requests, no Composer
- The virtual filesystem is at /app/ (a standard Laravel project)

You have these tools:
- read_file: Read a file's contents
- write_file: Write/create a file (parent dirs auto-created)
- list_files: List directory contents (use this to explore directories not shown in the tree below)
- run_artisan: Run Laravel Artisan commands (e.g. "make:model Post -m", "migrate", "route:list")

Guidelines:
- Always read a file before editing it so you understand its current contents.
- Write complete file contents — the tool overwrites the entire file.
- Use Artisan generators when possible (make:model, make:controller, make:migration, etc.).
- Tailwind CSS v4 is available in all views automatically (injected via CDN). Use Tailwind utility classes for all styling in Blade templates — no need for custom CSS or @vite directives.
- After making changes, give a brief summary in one sentence (two at most). Do not list every file you touched or repeat what the tools already showed.

Project structure (vendor, node_modules, storage, .git excluded — use list_files to explore them if needed):
${collectProjectTree('/app').join('\n')}`
}

interface ToolCallAccum {
  id: string
  name: string
  arguments: string
}

async function processStream(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const entryIndex = entries.value.length
  append('assistant', '')
  let accumulated = ''

  const toolCalls: Record<number, ToolCallAccum> = {}
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n')
    buffer = chunks.pop()!

    for (const line of chunks) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue

      let parsed: any
      try { parsed = JSON.parse(data) } catch { continue }

      if (parsed.usage) {
        usage = { prompt_tokens: parsed.usage.prompt_tokens, completion_tokens: parsed.usage.completion_tokens }
      }

      const delta = parsed.choices?.[0]?.delta
      if (!delta) continue

      if (delta.content) {
        accumulated += delta.content
        entries.value[entryIndex]!.body = renderMarkdown(accumulated)
        scrollToBottom()
      }

      if (delta.tool_calls) {
        for (const call of delta.tool_calls) {
          const idx = call.index
          if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', arguments: '' }
          if (call.id) toolCalls[idx].id = call.id
          if (call.function?.name) toolCalls[idx].name = call.function.name
          if (call.function?.arguments) toolCalls[idx].arguments += call.function.arguments
        }
      }
    }
  }

  entries.value[entryIndex]!.body = renderMarkdown(accumulated)
  // An empty turn that only produced tool calls leaves a blank bubble behind.
  if (!accumulated) entries.value.splice(entryIndex, 1)

  return { content: accumulated, toolCalls: Object.values(toolCalls), usage }
}

function toolLabel(name: string, args: any) {
  if (name === 'run_artisan') return `artisan ${args.command || ''}`
  if (name === 'write_file') return `write ${args.path || ''}`
  if (name === 'read_file') return `read ${args.path || ''}`
  if (name === 'list_files') return `ls ${args.directory || '/'}`
  return name
}

async function agentLoop() {
  const key = apiKey.value.trim()
  const systemPrompt = buildSystemPrompt()
  let totalInput = 0
  let totalOutput = 0

  while (true) {
    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model.value,
          messages: [{ role: 'system', content: systemPrompt }, ...conversation],
          tools: AGENT_TOOLS,
          stream: true,
          stream_options: { include_usage: true },
        }),
      })
    } catch (e: any) {
      append('error', `Network error: ${e.message}`)
      return
    }

    if (!response.ok) {
      let message: string
      try {
        message = (await response.json()).error?.message || response.statusText
      } catch {
        message = response.statusText
      }
      append('error', `API error (${response.status}): ${message}`)
      return
    }

    const { content, toolCalls, usage } = await processStream(response)
    if (usage) {
      totalInput += usage.prompt_tokens
      totalOutput += usage.completion_tokens
    }

    const assistantMsg: any = { role: 'assistant', content: content || null }
    if (toolCalls.length) {
      assistantMsg.tool_calls = toolCalls.map(call => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      }))
    }
    conversation.push(assistantMsg)

    if (!toolCalls.length) {
      if (totalInput || totalOutput) {
        append('usage', `${totalInput.toLocaleString()} in · ${totalOutput.toLocaleString()} out`)
      }
      return
    }

    for (const call of toolCalls) {
      let args: any
      try { args = JSON.parse(call.arguments) } catch { args = {} }

      const result = await executeAgentTool(call.name, args)
      const preview = result.length > 300 ? result.slice(0, 300) + '…' : result
      append('tool', preview, toolLabel(call.name, args))

      const MAX_TOOL_RESULT = 10000
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result.length > MAX_TOOL_RESULT
          ? result.slice(0, MAX_TOOL_RESULT) + `\n… (truncated, ${result.length} chars total)`
          : result,
      })
    }

    if (conversation.length > 20) {
      // Never split a tool_calls message from its tool results.
      let cut = conversation.length - 16
      while (cut < conversation.length && conversation[cut]!.role === 'tool') cut++
      conversation = conversation.slice(cut)
    }
  }
}

async function send() {
  const message = input.value.trim()
  if (running.value || !message) return

  if (!hasKey.value) {
    append('error', 'Add an OpenAI API key in Settings to use the agent.')
    return
  }

  running.value = true
  append('user', message)
  conversation.push({ role: 'user', content: message })
  input.value = ''

  try {
    await agentLoop()
  } catch (e: any) {
    append('error', e.message)
    console.error(e)
  } finally {
    running.value = false
  }
}

function clearChat() {
  conversation = []
  entries.value = []
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b bg-panel px-2">
      <Bot class="size-3.5 shrink-0 text-muted-foreground" />
      <select
        v-model="model"
        aria-label="Model"
        class="h-7 rounded-md border border-input bg-background px-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option v-for="option in MODEL_OPTIONS" :key="option" :value="option">{{ option }}</option>
      </select>

      <button
        v-if="!hasKey"
        type="button"
        class="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-brand transition-colors hover:bg-accent"
        @click="emit('openSettings')"
      >
        <KeyRound class="size-3.5" />
        Add API key
      </button>

      <Button variant="ghost" size="sm" class="ml-auto h-7" :disabled="!started || running" @click="clearChat">
        <Eraser class="size-3.5" />
        Clear
      </Button>
    </div>

    <div v-if="!started" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 class="text-lg font-semibold">What do you want to build?</h2>
      <p class="max-w-sm text-sm text-muted-foreground">
        The agent reads and writes files in the sandbox and runs Artisan commands to put your feature together.
      </p>
      <button
        v-if="!hasKey"
        type="button"
        class="text-xs text-brand underline-offset-4 hover:underline"
        @click="emit('openSettings')"
      >Add your OpenAI API key to get started</button>
    </div>

    <div v-else ref="outputEl" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
      <template v-for="(entry, i) in entries" :key="i">
        <div v-if="entry.role === 'user'" class="border-l-2 border-brand pl-3 font-medium">{{ entry.body }}</div>

        <div v-else-if="entry.role === 'assistant'" class="md-body" v-html="entry.body"></div>

        <div v-else-if="entry.role === 'tool'" class="overflow-hidden rounded-md border bg-muted/40">
          <div class="border-b px-2.5 py-1.5 font-mono text-xs font-medium">{{ entry.label }}</div>
          <pre class="max-h-40 overflow-auto whitespace-pre-wrap px-2.5 py-1.5 font-mono text-[11px] leading-5 text-muted-foreground">{{ entry.body }}</pre>
        </div>

        <p v-else-if="entry.role === 'error'" class="rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs text-destructive">
          {{ entry.body }}
        </p>

        <p v-else class="font-mono text-[11px] text-muted-foreground">{{ entry.body }}</p>
      </template>
    </div>

    <form class="safe-bottom flex shrink-0 items-center gap-2 border-t bg-panel px-3 py-2" @submit.prevent="send">
      <input
        v-model="input"
        type="text"
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        aria-label="Message the agent"
        placeholder="Add a blog with posts and comments…"
        :disabled="running"
        class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
      />
      <Button type="submit" size="icon" class="size-7 shrink-0" :disabled="running || !input.trim()" aria-label="Send">
        <ArrowUp v-if="!running" class="size-3.5" />
        <span v-else class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
      </Button>
    </form>
  </div>
</template>
