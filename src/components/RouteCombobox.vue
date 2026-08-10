<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { useRoutes } from '../composables/useRoutes'

const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** A concrete, parameterless route was picked — navigate straight to it. */
  select: [uri: string]
}>()

const { visibleRoutes, loading, error, showVendor, setShowVendor, ensureLoaded } = useRoutes()

const input = ref<HTMLInputElement | null>(null)
const listbox = ref<HTMLElement | null>(null)
const open = ref(false)
const highlighted = ref(-1)
// The field doubles as a free-text address bar, so only filter once the user
// has actually typed — opening on a previously picked route shows everything.
const filtering = ref(false)

const matches = computed(() => {
  const term = props.modelValue.trim().toLowerCase().replace(/^\//, '')
  if (!filtering.value || !term) return visibleRoutes.value
  return visibleRoutes.value.filter((route) =>
    route.uri.toLowerCase().includes(term)
    || (route.name ?? '').toLowerCase().includes(term)
    || route.action.toLowerCase().includes(term))
})

watch(matches, () => { highlighted.value = -1 })

async function openList() {
  if (props.disabled) return
  open.value = true
  filtering.value = false
  await ensureLoaded()
}

function close() {
  open.value = false
  highlighted.value = -1
}

function onInput(event: Event) {
  filtering.value = true
  open.value = true
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function move(delta: number) {
  if (!open.value) { void openList(); return }
  if (!matches.value.length) return
  const next = highlighted.value + delta
  highlighted.value = next < 0
    ? matches.value.length - 1
    : next >= matches.value.length ? 0 : next
  scrollHighlightedIntoView()
}

async function scrollHighlightedIntoView() {
  await nextTick()
  listbox.value?.children[highlighted.value]?.scrollIntoView({ block: 'nearest' })
}

/**
 * Picking a route fills the field. A route with `{parameters}` cannot be
 * requested as-is, so select the first one instead of navigating — the next
 * keystroke replaces it.
 */
async function choose(uri: string) {
  emit('update:modelValue', uri)
  close()

  const parameter = uri.match(/\{[^}]*\}/)
  if (!parameter || parameter.index === undefined) {
    emit('select', uri)
    return
  }

  await nextTick()
  input.value?.focus()
  input.value?.setSelectionRange(parameter.index, parameter.index + parameter[0].length)
}

function onEnter(event: KeyboardEvent) {
  if (!open.value || highlighted.value < 0) {
    close()
    return
  }
  // Take over from the surrounding form: pick the highlighted row instead.
  event.preventDefault()
  void choose(matches.value[highlighted.value]!.uri)
}

function onBlur() {
  // Pointer interactions inside the panel keep focus via mousedown.prevent, so
  // a real blur means focus left the control.
  close()
}
</script>

<template>
  <div class="relative min-w-0 max-w-lg flex-1">
    <input
      ref="input"
      :value="modelValue"
      type="text"
      role="combobox"
      spellcheck="false"
      autocapitalize="off"
      autocorrect="off"
      autocomplete="off"
      aria-label="Route to request"
      aria-autocomplete="list"
      :aria-expanded="open"
      placeholder="/"
      :disabled="disabled"
      class="h-7 w-full rounded-md border border-input bg-background pl-2 pr-7 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      @input="onInput"
      @focus="openList"
      @blur="onBlur"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.esc="close"
      @keydown.enter="onEnter"
    />

    <button
      type="button"
      tabindex="-1"
      aria-label="Show routes"
      :disabled="disabled"
      class="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      @mousedown.prevent="open ? close() : input?.focus()"
    >
      <ChevronDown class="size-3.5" :class="open && 'rotate-180'" />
    </button>

    <div
      v-if="open"
      class="absolute inset-x-0 top-8 z-50 min-w-72 overflow-hidden rounded-md border bg-popover shadow-lg"
      @mousedown.prevent
    >
      <ul v-if="matches.length" ref="listbox" role="listbox" class="max-h-72 overflow-y-auto py-1">
        <li
          v-for="(route, index) in matches"
          :key="route.uri"
          role="option"
          :aria-selected="index === highlighted"
          class="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs"
          :class="index === highlighted ? 'bg-accent text-accent-foreground' : 'text-foreground'"
          @mouseenter="highlighted = index"
          @click="choose(route.uri)"
        >
          <span class="truncate font-mono">{{ route.uri }}</span>
          <span
            v-if="route.vendor"
            class="shrink-0 rounded border px-1 text-[10px] text-muted-foreground"
          >vendor</span>
          <span v-if="route.name" class="ml-auto truncate text-[11px] text-muted-foreground">
            {{ route.name }}
          </span>
        </li>
      </ul>

      <p v-else class="px-2 py-3 text-center text-xs text-muted-foreground">
        {{ loading ? 'Reading routes…' : error || 'No matching routes' }}
      </p>

      <div class="border-t bg-panel">
        <button
          type="button"
          role="checkbox"
          :aria-checked="showVendor"
          class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          @click="setShowVendor(!showVendor)"
        >
          <span
            class="flex size-3.5 shrink-0 items-center justify-center rounded-sm border"
            :class="showVendor ? 'border-brand bg-brand text-brand-foreground' : 'border-input'"
          >
            <Check v-if="showVendor" class="size-2.5" />
          </span>
          Show framework and package routes
        </button>
      </div>
    </div>
  </div>
</template>
