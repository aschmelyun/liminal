import { stripAnsi } from './ansi'
import { splitHtmlErrorPage } from './htmlError'

/**
 * Normalise raw php-wasm stdout/stderr into something a terminal panel can
 * render: ANSI escapes removed, and any HTML error document reduced to a
 * plain-text summary routed to the error channel.
 */
export function toTerminalResult(
  rawOutput?: string,
  rawErrors?: string,
): { output: string; errors: string } {
  const { text, error } = splitHtmlErrorPage(stripAnsi(rawOutput || ''))
  const errors = stripAnsi(rawErrors || '').trimEnd()

  return {
    output: text,
    errors: [errors, error].filter(Boolean).join('\n\n'),
  }
}
