# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Liminal is a **browser-based Laravel IDE** that runs PHP 8.4 entirely in WebAssembly. It provides a code editor (CodeMirror 6), site preview, Artisan terminal, and an AI agent with tool-calling capabilities — all running client-side with no backend server.

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

- **`usePhp.ts`** — Singleton managing the PHP WASM runtime. Handles boot sequence (5 phases), VFS operations (read/write/list files at `/app/` prefix), PHP code execution, Laravel HTTP routing (`navigateTo`), and Artisan commands (`runArtisan`). This is the central abstraction that all views depend on.
- **`useGlyphs.ts`** — Matrix-rain animation for the loading screen.

### Tab-Based Views (App.vue)

Four views toggled with `v-show` (kept alive, not destroyed):
- **CodeView** — CodeMirror 6 editor with file tree sidebar. Language detection by extension (PHP, Blade, HTML, JS, JSON, CSS, TS). File saves via Cmd/Ctrl+S.
- **SiteView** — Renders Laravel routes in a sandboxed iframe by executing HTTP requests through the PHP kernel.
- **TerminalView** — Interactive Artisan command runner with command history (up/down arrows).
- **AgentView** — OpenAI chat integration with SSE streaming and 4 tool functions: `read_file`, `write_file`, `list_files`, `run_artisan`. API key/model stored in localStorage.

### WASM Chunk Reassembly

`main.ts` installs a global fetch interceptor that detects `.wasm` requests, checks for a `.wasm.json` manifest, and reassembles chunked parts into a single response. This is required for Cloudflare Pages deployment.

### CORS Headers

The Vite dev server and `public/_headers` configure `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` — required for SharedArrayBuffer which PHP WASM depends on.

## Code Conventions

- Vue 3 Composition API with `<script setup>` exclusively
- TypeScript strict mode; unused locals/params warnings disabled
- `shallowRef` for large objects (PHP instance), `ref` for normal state
- Components: PascalCase files. Composables: `use` prefix, camelCase files.
- Tailwind CSS v4 with stone/rose color palette
- No centralized state store — composables provide shared reactive state
