import { ref } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

// Module-level singleton so all components share the same state
const theme = ref<Theme>('system')
const isDark = ref(false)
let initialized = false

function applyTheme(t: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = t === 'dark' || (t === 'system' && prefersDark)
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme() {
  if (!initialized) {
    initialized = true
    const saved = localStorage.getItem('liminal-theme') as Theme | null
    theme.value = saved ?? 'system'
    applyTheme(theme.value)

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'system') applyTheme('system')
    })
  }

  function setTheme(t: Theme) {
    theme.value = t
    localStorage.setItem('liminal-theme', t)
    applyTheme(t)
  }

  return { theme, isDark, setTheme }
}
