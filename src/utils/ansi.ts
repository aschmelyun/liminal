/*
 * Symfony renders Artisan output with ANSI escape sequences whenever the
 * console considers the stream decorated, and Termwind emits its own codes
 * independently of that flag. Nothing in the browser interprets them, so they
 * surface in the terminal panel as literal escape-sequence noise.
 *
 * Matches CSI sequences (which covers every SGR colour code) and OSC sequences.
 */
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}
