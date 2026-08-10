import { ref, watch } from 'vue'

const KEY_STORAGE = 'liminal-agent-api-key'
const MODEL_STORAGE = 'liminal-agent-model'

export const MODEL_OPTIONS = [
  'gpt-5.2',
  'gpt-5.2-pro',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
]

const apiKey = ref(localStorage.getItem(KEY_STORAGE) ?? '')
const model = ref(localStorage.getItem(MODEL_STORAGE) ?? MODEL_OPTIONS[0]!)

watch(apiKey, (value) => {
  if (value) localStorage.setItem(KEY_STORAGE, value)
  else localStorage.removeItem(KEY_STORAGE)
})

watch(model, (value) => localStorage.setItem(MODEL_STORAGE, value))

export function useAgentSettings() {
  return { apiKey, model }
}
