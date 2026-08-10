<script setup lang="ts">
import { ref, watch } from 'vue'
import { Database, Play, RotateCw } from 'lucide-vue-next'
import { usePhp } from '../composables/usePhp'
import { useDatabase, type QueryResult } from '../composables/useDatabase'
import { Button } from '@/components/ui/button'

const { booted } = usePhp()
const { tables, exists, loading, error, refresh, runSql, quoteIdentifier, ROW_LIMIT } = useDatabase()

const selected = ref('')
const result = ref<QueryResult | null>(null)
const resultTitle = ref('')
const resultError = ref('')
const busy = ref(false)
const sql = ref('')

async function selectTable(name: string) {
  selected.value = name
  sql.value = `select * from ${quoteIdentifier(name)} limit ${ROW_LIMIT}`
  await execute(sql.value, name)
}

async function execute(statement: string, title?: string) {
  if (busy.value || !statement.trim()) return
  busy.value = true
  resultError.value = ''
  try {
    const outcome = await runSql(statement)
    result.value = outcome
    resultTitle.value = title ?? statement.trim()
    // A write can add or drop tables, so keep the list honest.
    if (outcome.affected !== null) await refresh()
  } catch (err: any) {
    result.value = null
    resultError.value = err.message || 'Query failed'
  } finally {
    busy.value = false
  }
}

async function reload() {
  await refresh()
  if (selected.value && tables.value.some(t => t.name === selected.value)) {
    await selectTable(selected.value)
  } else {
    selected.value = ''
    result.value = null
    resultTitle.value = ''
  }
}

watch(booted, async (ready) => {
  if (!ready) return
  await refresh()
  const first = tables.value[0]
  if (first && !selected.value) selectTable(first.name)
}, { immediate: true })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b bg-panel px-2">
      <Database class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="truncate font-mono text-xs">database/database.sqlite</span>
      <span v-if="exists" class="shrink-0 text-xs text-muted-foreground">
        · {{ tables.length }} {{ tables.length === 1 ? 'table' : 'tables' }}
      </span>
      <Button variant="ghost" size="icon" class="ml-auto size-7" :disabled="loading || busy" aria-label="Reload schema" @click="reload">
        <RotateCw class="size-3.5" :class="(loading || busy) && 'animate-spin'" />
      </Button>
    </div>

    <div v-if="!exists && !loading" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <Database class="size-5 text-muted-foreground" />
      <p class="text-sm text-muted-foreground">No database file yet.</p>
      <p class="max-w-sm text-xs text-muted-foreground">
        Run <code class="rounded border bg-muted px-1 py-0.5 font-mono">migrate</code> in the Terminal to create
        <span class="font-mono">database/database.sqlite</span>.
      </p>
    </div>

    <div v-else class="flex min-h-0 flex-1">
      <nav class="flex w-48 shrink-0 flex-col border-r bg-panel">
        <div class="flex h-8 shrink-0 items-center px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Tables
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-1">
          <button
            v-for="table in tables"
            :key="table.name"
            type="button"
            class="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left font-mono text-xs transition-colors hover:bg-accent"
            :class="selected === table.name ? 'bg-accent text-foreground' : 'text-muted-foreground'"
            @click="selectTable(table.name)"
          >
            <span class="truncate">{{ table.name }}</span>
            <span class="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{{ table.rows }}</span>
          </button>
          <p v-if="!tables.length" class="px-2 py-4 text-xs text-muted-foreground">No tables.</p>
        </div>
      </nav>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-auto">
          <div v-if="resultError" class="p-4">
            <div class="rounded-lg border border-destructive/40 p-3">
              <p class="text-xs font-medium text-destructive">SQLite error</p>
              <pre class="mt-1.5 whitespace-pre-wrap font-mono text-xs text-muted-foreground">{{ resultError }}</pre>
            </div>
          </div>

          <div v-else-if="result && result.affected !== null" class="p-4">
            <p class="text-sm text-muted-foreground">
              Statement executed · {{ result.affected }} {{ result.affected === 1 ? 'row' : 'rows' }} affected.
            </p>
          </div>

          <table v-else-if="result && result.columns.length" class="w-full border-collapse text-xs">
            <thead class="sticky top-0 z-10 bg-panel">
              <tr>
                <th
                  v-for="column in result.columns"
                  :key="column"
                  class="whitespace-nowrap border-b border-r px-3 py-1.5 text-left font-mono font-medium text-muted-foreground last:border-r-0"
                >{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in result.rows" :key="i" class="hover:bg-accent/50">
                <td
                  v-for="(cell, j) in row"
                  :key="j"
                  class="max-w-md truncate border-b border-r px-3 py-1.5 font-mono last:border-r-0"
                  :class="cell === null && 'text-muted-foreground/50 italic'"
                  :title="cell ?? 'NULL'"
                >{{ cell === null ? 'NULL' : cell }}</td>
              </tr>
            </tbody>
          </table>

          <p v-else-if="result" class="p-4 text-sm text-muted-foreground">No rows.</p>
          <p v-else-if="error" class="p-4 text-sm text-destructive">{{ error }}</p>
          <p v-else class="p-4 text-sm text-muted-foreground">Pick a table, or run a query below.</p>
        </div>

        <div
          v-if="result && !resultError"
          class="flex h-7 shrink-0 items-center gap-2 border-t bg-panel px-3 text-[11px] text-muted-foreground"
        >
          <span class="truncate font-mono">{{ resultTitle }}</span>
          <span v-if="result.affected === null" class="ml-auto shrink-0 tabular-nums">
            {{ result.rows.length }} {{ result.rows.length === 1 ? 'row' : 'rows' }}<template v-if="result.truncated"> (capped at {{ ROW_LIMIT }})</template>
          </span>
        </div>
      </div>
    </div>

    <form class="safe-bottom flex shrink-0 items-center gap-2 border-t bg-panel px-3 py-2" @submit.prevent="execute(sql)">
      <span class="shrink-0 select-none font-mono text-xs text-muted-foreground">sql</span>
      <input
        v-model="sql"
        type="text"
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        aria-label="SQL statement"
        placeholder="select * from users where id > 1"
        class="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/60"
      />
      <Button type="submit" size="sm" class="h-7 shrink-0" :disabled="busy || !sql.trim()">
        <Play class="size-3.5" />
        Run
      </Button>
    </form>
  </div>
</template>
