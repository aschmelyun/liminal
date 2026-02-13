<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { usePhp } from '../composables/usePhp'

const {
  php, readFile, writeFile, listFiles, fileExists, isDir, mkdir,
  runArtisan, collectVfsPaths,
} = usePhp()

const apiKey = ref('')
const model = ref('gpt-5.2')
const outputEl = ref<HTMLDivElement | null>(null)
const inputValue = ref('')
const agentRunning = ref(false)

interface OutputEntry {
  role: 'user' | 'assistant' | 'tool'
  html: string
}

const outputEntries = ref<OutputEntry[]>([])
const showPlaceholder = ref(true)

let agentMessages: any[] = []

const modelOptions = [
  'gpt-5.2',
  'gpt-5.2-pro',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
]

onMounted(() => {
  const savedKey = localStorage.getItem('liminal-agent-api-key')
  const savedModel = localStorage.getItem('liminal-agent-model')
  if (savedKey) apiKey.value = savedKey
  if (savedModel) model.value = savedModel
})

function onApiKeyInput() {
  localStorage.setItem('liminal-agent-api-key', apiKey.value)
}

function onModelChange() {
  localStorage.setItem('liminal-agent-model', model.value)
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(text: string) {
  // Code blocks: ```lang\n...\n```
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
    let highlighted = escapeHtml(code.trimEnd())
    if (lang && (self as any).hljs) {
      try {
        const result = (self as any).hljs.highlight(code.trimEnd(), { language: lang, ignoreIllegals: true })
        highlighted = result.value
      } catch (_) {}
    }
    return `<pre><code class="${lang ? `hljs language-${lang}` : ''}">${highlighted}</code></pre>`
  })
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  return text
}

function appendEntry(role: OutputEntry['role'], html: string) {
  showPlaceholder.value = false
  outputEntries.value.push({ role, html })
  scrollToBottom()
}

function scrollToBottom() {
  nextTick(() => {
    if (outputEl.value) {
      outputEl.value.scrollTop = outputEl.value.scrollHeight
    }
  })
}

// Tool definitions for OpenAI
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Path is relative to the Laravel project root (e.g. "routes/web.php").',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
        },
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
        properties: {
          directory: { type: 'string', description: 'Directory path relative to project root' },
        },
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
        properties: {
          command: { type: 'string', description: 'Artisan command to run (without "php artisan" prefix)' },
        },
        required: ['command'],
      },
    },
  },
]

async function executeAgentTool(name: string, args: any): Promise<string> {
  const vfsBase = '/app'

  if (name === 'read_file') {
    const vfsPath = `${vfsBase}/${args.path}`
    try {
      return readFile(vfsPath)
    } catch (e) {
      return `Error: file not found — ${args.path}`
    }
  }

  if (name === 'write_file') {
    const vfsPath = `${vfsBase}/${args.path}`
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
    const dir = args.directory && args.directory !== '.' ? `${vfsBase}/${args.directory}` : vfsBase
    try {
      const entries = listFiles(dir)
      return entries.map((name: string) => {
        const full = `${dir}/${name}`
        return isDir(full) ? `${name}/` : name
      }).join('\n')
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
  const lines: string[] = []
  try {
    const entries = listFiles(dir)
    for (const name of entries) {
      const full = `${dir}/${name}`
      if (isDir(full)) {
        if (depth === 0 && EXCLUDED_TREE_DIRS.has(name)) {
          lines.push(`${name}/  (excluded)`)
        } else {
          lines.push(`${name}/`)
          if (depth < 3) {
            lines.push(...collectProjectTree(full, depth + 1).map(l => '  ' + l))
          }
        }
      } else {
        lines.push(name)
      }
    }
  } catch (_) {}
  return lines
}

function buildSystemPrompt() {
  const fileTree = collectProjectTree('/app')

  return `You are an AI assistant embedded in Liminal, a browser-based Laravel 12 IDE running PHP 8.4 via WebAssembly.

Environment:
- Laravel 12 with PHP 8.4 (compiled to WASM, runs entirely in the browser)
- SQLite database (in-memory)
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
${fileTree.join('\n')}`
}

// SSE stream processor
interface ToolCallAccum {
  id: string
  name: string
  arguments: string
}

async function processStream(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // Create a streaming assistant message entry
  const entryIndex = outputEntries.value.length
  appendEntry('assistant', '')
  let accumulated = ''

  const toolCalls: Record<number, ToolCallAccum> = {}
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue

      let parsed: any
      try { parsed = JSON.parse(data) } catch (_) { continue }

      if (parsed.usage) {
        usage = { prompt_tokens: parsed.usage.prompt_tokens, completion_tokens: parsed.usage.completion_tokens }
      }

      const delta = parsed.choices?.[0]?.delta
      if (!delta) continue

      if (delta.content) {
        accumulated += delta.content
        outputEntries.value[entryIndex]!.html = renderMarkdown(accumulated)
        scrollToBottom()
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: '', name: '', arguments: '' }
          }
          if (tc.id) toolCalls[idx].id = tc.id
          if (tc.function?.name) toolCalls[idx].name = tc.function.name
          if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
        }
      }
    }
  }

  // Finalize the message
  outputEntries.value[entryIndex]!.html = renderMarkdown(accumulated)
  const toolCallList = Object.values(toolCalls)
  return { content: accumulated, toolCalls: toolCallList, usage }
}

async function agentLoop() {
  const key = apiKey.value.trim()
  const mdl = model.value
  let totalInput = 0
  let totalOutput = 0
  const systemPrompt = buildSystemPrompt()

  while (true) {
    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: mdl,
          messages: [
            { role: 'system', content: systemPrompt },
            ...agentMessages,
          ],
          tools: AGENT_TOOLS,
          stream: true,
          stream_options: { include_usage: true },
        }),
      })
    } catch (e: any) {
      appendEntry('tool', `<span class="text-red-600">Network error: ${escapeHtml(e.message)}</span>`)
      return
    }

    if (!response.ok) {
      let errMsg: string
      try {
        const err = await response.json()
        errMsg = err.error?.message || response.statusText
      } catch (_) {
        errMsg = response.statusText
      }
      appendEntry('tool', `<span class="text-red-600">API error (${response.status}): ${escapeHtml(errMsg)}</span>`)
      return
    }

    const { content, toolCalls, usage } = await processStream(response)
    if (usage) {
      totalInput += usage.prompt_tokens
      totalOutput += usage.completion_tokens
    }

    const assistantMsg: any = { role: 'assistant', content: content || null }
    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls.map((tc: ToolCallAccum) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }))
    }
    agentMessages.push(assistantMsg)

    if (toolCalls.length === 0) {
      if (totalInput > 0 || totalOutput > 0) {
        appendEntry('tool', `<span class="text-stone-400 text-xs">Tokens — input: ${totalInput.toLocaleString()} / output: ${totalOutput.toLocaleString()}</span>`)
      }
      return
    }

    for (const tc of toolCalls) {
      let args: any
      try { args = JSON.parse(tc.arguments) } catch (_) { args = {} }

      const toolLabel = tc.name === 'run_artisan' ? `artisan ${args.command || ''}` :
        tc.name === 'write_file' ? `write ${args.path || ''}` :
        tc.name === 'read_file' ? `read ${args.path || ''}` :
        tc.name === 'list_files' ? `ls ${args.directory || '/'}` : tc.name
      appendEntry('tool', `<span class="tool-name">${escapeHtml(toolLabel)}</span>`)

      const result = await executeAgentTool(tc.name, args)

      const preview = result.length > 300 ? result.slice(0, 300) + '...' : result
      appendEntry('tool', `<pre class="whitespace-pre-wrap text-xs mt-1">${escapeHtml(preview)}</pre>`)

      const maxToolResult = 10000
      const truncatedResult = result.length > maxToolResult
        ? result.slice(0, maxToolResult) + `\n... (truncated, ${result.length} chars total)`
        : result

      agentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: truncatedResult,
      })
    }

    if (agentMessages.length > 20) {
      // Find a safe cut point — never split a tool_calls/tool pair
      let cut = agentMessages.length - 16
      while (cut < agentMessages.length && agentMessages[cut]!.role === 'tool') {
        cut++
      }
      agentMessages = agentMessages.slice(cut)
    }
  }
}

async function sendMessage() {
  if (agentRunning.value) return
  const trimmed = inputValue.value.trim()
  if (!trimmed) return

  const key = apiKey.value.trim()
  if (!key) {
    appendEntry('tool', '<span class="text-red-600">Add your OpenAI API key above to get started.</span>')
    return
  }

  agentRunning.value = true
  appendEntry('user', escapeHtml(trimmed))
  agentMessages.push({ role: 'user', content: trimmed })

  try {
    await agentLoop()
  } catch (e: any) {
    appendEntry('tool', `<span class="text-red-600">Error: ${escapeHtml(e.message)}</span>`)
    console.error(e)
  } finally {
    agentRunning.value = false
    inputValue.value = ''
  }
}

function clearChat() {
  agentMessages = []
  outputEntries.value = []
  showPlaceholder.value = true
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') sendMessage()
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Initial hero screen -->
    <template v-if="showPlaceholder">
      <div class="flex-1 flex items-center justify-center px-6">
        <div class="bg-white rounded-2xl shadow-lg border border-stone-200 px-8 py-10 flex flex-col items-center w-full max-w-lg">
          <h2 class="text-2xl font-semibold text-stone-700 mb-2">What do you want to build?</h2>
          <p class="text-sm text-stone-400 mb-6">Describe what you're imagining and the agent will build it.</p>
          <div class="w-full flex items-center gap-2">
            <input
              v-model="inputValue"
              type="text"
              spellcheck="false"
              autocapitalize="off"
              autocorrect="off"
              placeholder="Add a blog with posts and comments..."
              class="flex-1 px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-700 outline-none focus:border-stone-400 focus:bg-white"
              @keydown="onKeydown"
            />
            <button
              class="px-4 py-2.5 text-sm font-medium text-white bg-rose-500 rounded-lg hover:bg-rose-600 shrink-0"
              @click="sendMessage"
            >Build</button>
          </div>
          <div class="flex items-center gap-3 mt-4">
            <input
              v-model="apiKey"
              type="password"
              placeholder="OpenAI API key"
              class="px-2 py-1 text-xs font-mono bg-stone-50 border border-stone-200 rounded-md text-stone-500 outline-none focus:border-stone-400 focus:bg-white w-48"
              @input="onApiKeyInput"
            />
            <select
              v-model="model"
              class="px-2 py-1 text-xs bg-stone-50 border border-stone-200 rounded-md text-stone-500 outline-none focus:border-stone-400"
              @change="onModelChange"
            >
              <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
        </div>
      </div>
    </template>

    <!-- Chat layout (after first message) -->
    <template v-else>
      <!-- Settings bar -->
      <div class="border-b border-stone-200 bg-white px-4 py-2 shrink-0 flex items-center gap-3 flex-wrap">
        <input
          v-model="apiKey"
          type="password"
          placeholder="OpenAI API key"
          class="px-2 py-1 text-sm font-mono bg-stone-50 border border-stone-200 rounded-md text-stone-700 outline-none focus:border-stone-400 focus:bg-white w-52"
          @input="onApiKeyInput"
        />
        <select
          v-model="model"
          class="px-2 py-1 text-sm bg-stone-50 border border-stone-200 rounded-md text-stone-700 outline-none focus:border-stone-400"
          @change="onModelChange"
        >
          <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
        </select>
        <button
          class="px-2.5 py-1 text-xs font-medium text-stone-500 border border-stone-200 rounded-md hover:bg-stone-50 shrink-0"
          @click="clearChat"
        >Clear Chat</button>
      </div>
      <!-- Chat output -->
      <div ref="outputEl" class="flex-1 overflow-y-auto p-4 text-sm">
        <div
          v-for="(entry, i) in outputEntries"
          :key="i"
          :class="{
            'agent-msg-user': entry.role === 'user',
            'agent-msg-assistant': entry.role === 'assistant',
            'agent-msg-tool': entry.role === 'tool',
          }"
          v-html="entry.html"
        ></div>
      </div>
      <!-- Chat input -->
      <div class="panel-agent-input border-t border-stone-200 bg-white px-4 pt-3 pb-8 md:py-3 shrink-0 flex items-center gap-2">
        <input
          v-model="inputValue"
          type="text"
          spellcheck="false"
          autocapitalize="off"
          autocorrect="off"
          placeholder="Add a blog with posts and comments..."
          class="flex-1 px-2 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-md text-stone-700 outline-none focus:border-stone-400 focus:bg-white"
          :disabled="agentRunning"
          @keydown="onKeydown"
        />
        <button
          :disabled="agentRunning"
          class="relative px-2.5 py-1.5 text-xs font-medium text-white bg-rose-500 rounded-md hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          @click="sendMessage"
        >
          <span :class="{ 'invisible': agentRunning }">Build</span>
          <span v-if="agentRunning" class="absolute inset-0 flex items-center justify-center">
            <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </span>
        </button>
      </div>
    </template>
  </div>
</template>
