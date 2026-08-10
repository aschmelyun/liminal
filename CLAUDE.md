# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Liminal is a **browser-based Laravel IDE** that runs PHP 8.4 entirely in WebAssembly. It provides a code editor (CodeMirror 6), site preview, Artisan/Composer terminal, and a SQLite browser — all running client-side.

The only server-side component is `functions/api/dist.ts`, a Cloudflare Pages Function that proxies Packagist metadata and package archives (their hosts do not send usable CORS headers).

## Build Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Full build: bundle Laravel app → type-check → Vite build → split WASM
npm run bundle       # Bundle Laravel app (../liminal/app) into public/app.zip
npm run preview      # Preview production build
```

The build pipeline has three custom steps:
1. **bundle-app.js** zips the Laravel project from `../liminal/app` into `public/app.zip`
2. **vue-tsc** runs TypeScript type checking
3. **split-wasm.js** chunks WASM files >24MB for Cloudflare Pages' file size limit, creating `.wasm.part*` files with a `.wasm.json` manifest

## Architecture

### Runtime Model

PHP 8.4 runs in-browser via `@php-wasm/web-8-4`. On boot, the app downloads `app.zip`, extracts a Laravel project into a virtual filesystem (VFS), then bootstraps Laravel. All PHP execution (routing, Artisan commands) happens client-side through the WASM runtime.

### Key Composables

- **`usePhp.ts`** — Singleton managing the PHP WASM runtime. Handles the boot sequence, VFS operations (read/write/list files at `/app/` prefix), PHP code execution, Laravel HTTP routing (`navigateTo`), and Artisan commands (`runArtisan`). `query()` runs a PHP snippet and parses its stdout as JSON — the standard way to pull structured data out of the runtime. `bootLog` is the rolling tail of files written during boot, streamed by the loading screen.
- **`useWorkspace.ts`** — Cross-panel state: the active file path (sidebar highlight + status bar) and the file-tree collapse token.
- **`useDatabase.ts`** — SQLite access over PDO: table list with row counts, and `runSql()`. SQL is base64-encoded into the PHP snippet so nothing needs escaping.
- **`useComposer.ts`** — runtime `composer require`: constraint solving via the real `composer/semver` (run inside the WASM PHP), archive download through `/api/dist`, extraction into the VFS, and an IndexedDB cache of package zips plus a lock so installs survive a reload.
- **`useGlyphs.ts`** — Matrix-rain animation for the loading screen.

### Shell Layout (App.vue)

`AppHeader` (brand + tab strip + theme/GitHub/settings) → three-column grid (`WorkspaceSidebar` / active view / `SandboxPanel`) → `StatusBar`. The right panel is collapsible from the status bar and its state persists in localStorage. `SettingsDialog` is a modal, not a view.

Each view owns a single `h-9` contextual toolbar as its first child — that's the only per-view chrome. Views are toggled with `v-show` (kept alive, not destroyed):
- **SiteView** — Renders Laravel routes in a sandboxed iframe by executing HTTP requests through the PHP kernel. Tailwind is injected into the response; "open in new tab" pops the rendered HTML as a blob URL.
- **CodeView** — CodeMirror 6 editor. Language detection by extension (PHP, Blade, HTML, JS, JSON, CSS, TS). Saves via Cmd/Ctrl+S. A `chromeTheme` layered over `oneDark` binds the editor background, gutters, selection and caret to the design tokens.
- **TerminalView** — Artisan and Composer command runner with history (up/down arrows). Output is typed line objects, not HTML strings.
- **DatabaseView** — SQLite browser: table list, row viewer (capped at 500 rows), and a raw SQL bar.

### WASM Chunk Reassembly

`main.ts` installs a global fetch interceptor that detects `.wasm` requests, checks for a `.wasm.json` manifest, and reassembles chunked parts into a single response. This is required for Cloudflare Pages deployment.

### CORS Headers

The Vite dev server and `public/_headers` configure `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` — required for SharedArrayBuffer which PHP WASM depends on.

## Code Conventions

- Vue 3 Composition API with `<script setup>` exclusively
- TypeScript strict mode; unused locals/params warnings disabled
- `shallowRef` for large objects (PHP instance), `ref` for normal state
- Components: PascalCase files. Composables: `use` prefix, camelCase files.
- No centralized state store — composables provide shared reactive state
- Tailwind CSS v4 driven entirely by the tokens in `src/style.css`. Never hardcode `stone-*` / `rose-*` in components — use `background` (content), `panel` (chrome), `muted`, `border`, `foreground`, `muted-foreground`, plus `destructive` / `success` for output state.
- `brand` (rose) is reserved for identity and signal: logo mark, progress, focus rings, unsaved/active markers. Primary buttons stay neutral.
- shadcn-style primitives live in `src/components/ui/`; prefer them over bespoke markup.
