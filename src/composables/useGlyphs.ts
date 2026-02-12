import { ref, onUnmounted } from 'vue'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+-={}[]|\\:;"\'<>,.?/'
const SPACE_RATIO = 0.85

export function useGlyphs() {
  const glyphText = ref('')
  let intervalId: ReturnType<typeof setInterval> | null = null

  function fillGlyphs() {
    const w = window.innerWidth
    const h = window.innerHeight
    const charW = 8.4
    const lineH = 20
    const cols = Math.ceil(w / charW) + 1
    const rows = Math.ceil(h / lineH) + 1
    const total = cols * rows

    const chars = Array.from({ length: total }, () =>
      Math.random() < SPACE_RATIO ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
    )

    let text = ''
    for (let i = 0; i < chars.length; i++) {
      text += chars[i]
      if ((i + 1) % cols === 0) text += '\n'
    }
    glyphText.value = text
  }

  function start() {
    fillGlyphs()
    intervalId = setInterval(fillGlyphs, 200)
    window.addEventListener('resize', onResize)
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
    window.removeEventListener('resize', onResize)
  }

  function onResize() {
    if (intervalId) fillGlyphs()
  }

  onUnmounted(stop)

  return { glyphText, start, stop }
}
