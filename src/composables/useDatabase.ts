import { ref } from 'vue'
import { usePhp } from './usePhp'

export const DB_PATH = '/app/database/database.sqlite'

export interface DbTable {
  name: string
  rows: number
}

export interface QueryResult {
  columns: string[]
  rows: (string | null)[][]
  /** Rows affected — only meaningful for statements that return no result set. */
  affected: number | null
  truncated: boolean
}

const ROW_LIMIT = 500

// Module-level so the sidebar badge and the Database view stay in step.
const tables = ref<DbTable[]>([])
const exists = ref(false)
const loading = ref(false)
const error = ref('')

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Shared PHP preamble: open the sandbox database or bail out with a JSON error. */
const OPEN_DB = `
  $path = '${DB_PATH}';
  if (!file_exists($path)) { echo json_encode(['missing' => true]); return; }
  if (!class_exists('PDO')) { echo json_encode(['error' => 'The PDO extension is not available in this runtime.']); return; }
  $pdo = new PDO('sqlite:' . $path);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
`

export function useDatabase() {
  const { query, touchVfs } = usePhp()

  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      const result = await query<{ missing?: boolean; error?: string; tables?: DbTable[] }>(`<?php
        try {
          ${OPEN_DB}
          $names = $pdo
            ->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            ->fetchAll(PDO::FETCH_COLUMN);
          $tables = [];
          foreach ($names as $name) {
            $count = $pdo->query('SELECT COUNT(*) FROM "' . str_replace('"', '""', $name) . '"')->fetchColumn();
            $tables[] = ['name' => $name, 'rows' => (int) $count];
          }
          echo json_encode(['tables' => $tables]);
        } catch (Throwable $e) {
          echo json_encode(['error' => $e->getMessage()]);
        }
      `)

      if (result.missing) {
        exists.value = false
        tables.value = []
        return
      }
      if (result.error) throw new Error(result.error)

      exists.value = true
      tables.value = result.tables ?? []
    } catch (err: any) {
      error.value = err.message || 'Failed to read the database'
      tables.value = []
    } finally {
      loading.value = false
    }
  }

  async function runSql(sql: string): Promise<QueryResult> {
    const result = await query<{
      missing?: boolean
      error?: string
      columns?: string[]
      rows?: (string | null)[][]
      affected?: number | null
      truncated?: boolean
    }>(`<?php
      try {
        ${OPEN_DB}
        $sql = base64_decode('${toBase64(sql)}');
        $stmt = $pdo->query($sql);

        if ($stmt->columnCount() === 0) {
          echo json_encode(['columns' => [], 'rows' => [], 'affected' => $stmt->rowCount()]);
          return;
        }

        $fetched = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $truncated = count($fetched) > ${ROW_LIMIT};
        $fetched = array_slice($fetched, 0, ${ROW_LIMIT});
        $columns = $fetched ? array_keys($fetched[0]) : [];

        $rows = [];
        foreach ($fetched as $record) {
          $cells = [];
          foreach ($columns as $column) {
            $value = $record[$column];
            if ($value === null) { $cells[] = null; continue; }
            $value = (string) $value;
            if (!preg_match('//u', $value)) {
              $cells[] = '<' . strlen($value) . ' bytes>';
            } elseif (strlen($value) > 240) {
              $cells[] = substr($value, 0, 240) . '…';
            } else {
              $cells[] = $value;
            }
          }
          $rows[] = $cells;
        }

        echo json_encode([
          'columns' => $columns,
          'rows' => $rows,
          'affected' => null,
          'truncated' => $truncated,
        ]);
      } catch (Throwable $e) {
        echo json_encode(['error' => $e->getMessage()]);
      }
    `)

    if (result.missing) throw new Error('No database file at database/database.sqlite')
    if (result.error) throw new Error(result.error)

    // A statement with no result set changed something on disk.
    if (result.affected !== null && result.affected !== undefined) touchVfs()

    return {
      columns: result.columns ?? [],
      rows: result.rows ?? [],
      affected: result.affected ?? null,
      truncated: result.truncated ?? false,
    }
  }

  function quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`
  }

  return { tables, exists, loading, error, refresh, runSql, quoteIdentifier, ROW_LIMIT }
}
