# Liminal

A browser-based Laravel IDE. PHP 8.4 runs entirely in WebAssembly — no local installs or uploads. Write, run, and preview Laravel applications without leaving the tab.

**[liminal.aschmelyun.com](https://liminal.aschmelyun.com)** — deployed on Cloudflare Pages. Feel free to try it out; the PHP runtime and project filesystem stay sandboxed in your browser.

---

## Features

| View | Description |
|------|-------------|
| **Preview** | Navigate routes and see rendered HTML output. Tailwind CSS v4 is injected automatically. |
| **Code** | Browse and edit project files with syntax highlighting (PHP, Blade, JS/TS, JSON, CSS). |
| **Terminal** | Run Artisan commands directly in the browser with command history. |
| **Agent** | OpenAI-powered assistant that reads/writes files and runs Artisan to build features. |
| **Tools** | Import from GitHub, export as `.zip`, sync to a local folder, and configure settings. |

Additional features:
- **Share URLs** — encode your file diffs into a URL; anyone who opens it gets your changes applied automatically
- **Runtime Composer packages** — install Packagist dependencies (including transitive dependencies) from the terminal and restore them across reloads
- **Dark mode** — light, dark, or system theme, persisted across sessions
- **Local sync** — mirror the virtual filesystem to a local folder via the File System Access API (Chrome/Edge)

## Tech Stack

- [Vue 3](https://vuejs.org) + TypeScript + Vite
- [Tailwind CSS v4](https://tailwindcss.com)
- [CodeMirror 6](https://codemirror.net)
- [Laravel 13](https://laravel.com) — embedded Laravel app bundled into `app.zip`
- [@php-wasm/web-8-4](https://github.com/WordPress/wordpress-playground) — PHP 8.4 compiled to WebAssembly

## Running Locally

```bash
npm install
```

Before building, make sure Composer dependencies are installed inside the embedded Laravel app:

```bash
cd ../liminal/app   # path to the Laravel project
composer install --no-dev --optimize-autoloader
```

> [!NOTE]
> I gotta figure out a way to do this without Composer and without having to commit the whole dang vendor directory.

Then build and preview:

```bash
npm run build
npm run preview
```

`npm run build` bundles the Laravel app into `public/app.zip`, runs type checking, and produces the final static assets. `npm run preview` starts a local web server serving that output — use this rather than `npm run dev` when you need to test the full built artifact (e.g. WASM chunk reassembly).

### Build pipeline

The build runs three steps:

1. **`bundle-app.js`** — stages the tracked Composer runtime from `src/php/composer/` into `app/.liminal/`, then zips the Laravel project into `public/app.zip`
2. **`vue-tsc`** — TypeScript type checking
3. **`split-wasm.js`** — chunks WASM files >24 MB into `.wasm.part*` files with a manifest, required for Cloudflare Pages' file size limit

## How It Works

On boot, the app downloads `app.zip` and extracts it into an in-memory virtual filesystem. From that point on, all PHP execution — routing, database queries, Artisan commands, dependency semantics, and autoloading — happens entirely client-side via the WASM runtime.

The browser-side resolver reads Packagist metadata through a small, allowlisted Cloudflare Pages Function. The same function proxies package archives whose upstream redirects are not browser-CORS compatible; it does not execute PHP or receive project files. Vite exposes the same proxy during local development and previews. Downloaded archives and the dependency lock are cached in IndexedDB so packages can be restored without a network request after a reload.

[`SharedArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) is required by the WASM runtime and needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` headers, which are configured in both the Vite dev server and `public/_headers` for Cloudflare Pages.

## Limitations

- No network access from PHP (`file_get_contents` over HTTP and `curl` are unavailable); the browser-side Composer PoC supports `composer require` only
- Composer dependency resolution is intentionally greedy: it does not backtrack, run package scripts/plugins, or implement `update`/`remove`
- SQLite only — no MySQL/Postgres
- Performance is slower than native PHP, especially on first boot

## License

This project is licensed under MIT, but uses [php-wasm](https://github.com/seanmorris/php-wasm) which is licensed as GPLv2. If you're cloning this project or using it in your own derivitive works, just keep that in mind! 
