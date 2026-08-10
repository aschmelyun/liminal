import { ref } from 'vue'

/**
 * Cross-panel workspace state. Module-level so the sidebar, editor and
 * toolbar all read the same values without prop drilling.
 */
const activeFilePath = ref<string | null>(null)
const collapseToken = ref(0)

export function useWorkspace() {
  function collapseTree() {
    collapseToken.value++
  }

  return { activeFilePath, collapseToken, collapseTree }
}
