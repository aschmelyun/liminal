/*
 * When Laravel renders an exception it picks between a console renderer and a
 * full HTML debug page. We force console context for Artisan runs, but a
 * failure early enough in the boot sequence can still produce a whole HTML
 * document — which is useless in a terminal panel. Reduce it to plain text.
 */
const DOCUMENT_START = /<!doctype\s+html|<html[\s>]/i
const MAX_SUMMARY = 800

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}

function summarize(html: string): string {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
  const body = decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()

  const detail = body.length > MAX_SUMMARY ? `${body.slice(0, MAX_SUMMARY)}…` : body
  const lines = ['Laravel rendered an HTML error page. Text summary:']
  if (title && !detail.startsWith(title)) lines.push(`  ${title}`)
  if (detail) lines.push(`  ${detail}`)
  return lines.join('\n')
}

/**
 * Split raw command output into the text a terminal should show and, if an
 * HTML error document was appended, a plain-text summary of it.
 */
export function splitHtmlErrorPage(raw: string): { text: string; error: string } {
  const start = raw.search(DOCUMENT_START)
  if (start === -1 || !/<\/html>/i.test(raw)) return { text: raw, error: '' }
  return {
    text: raw.slice(0, start).trimEnd(),
    error: summarize(raw.slice(start)),
  }
}
