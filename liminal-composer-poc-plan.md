# Liminal — Dynamic Composer PoC Implementation Plan

Target repo: `aschmelyun/liminal` (Vue 3 + TS + Vite, `@php-wasm/universal` + `@php-wasm/web-8-4`, Laravel 13 bundled as `public/app.zip`, deployed static on Cloudflare Pages).

Goal: let users run `composer require vendor/package` at runtime in the deployed playground, with transitive dependency resolution, correct autoloading, Laravel package discovery, and cross-reload persistence — without shipping the real Composer package.

---

## 0. Current state (read before changing anything)

`src/composables/usePhp.ts` already contains `runComposerRequire()`, `registerPackageAutoload()`, and `dumpAutoload()`. **All three are being replaced.** Known defects:

| Location | Problem |
| --- | --- |
| `runComposerRequire` | Uses legacy `packagist.org/packages/{v}/{n}.json`; picks "latest stable" by substring-matching `dev`/`alpha`/`beta`/`RC` on an object whose key order is not guaranteed. |
| `runComposerRequire` | **No transitive dependency resolution at all.** Requiring anything non-trivial installs a broken tree. |
| `runComposerRequire` | Downloads via `https://cors-anywhere.com/{distUrl}` — not a functioning proxy. This path is dead in production. |
| `registerPackageAutoload` | Regex string-surgery on Composer's generated `autoload_psr4.php` and `autoload_static.php`. Brittle; handles only `psr-4`; ignores `psr-0`, `files`, `classmap`. |
| `dumpAutoload` | `require`s `autoload_real.php` then `autoload.php` in one process — effectively a no-op, since the FS-backed autoloader is re-required on every `php.run()` anyway. |
| everywhere | No persistence. MEMFS is wiped on reload; every refresh re-downloads. |

Three call sites duplicate the same PHP preamble (`boot`, `navigateTo`, `runArtisan`). Refactor that first — it's the hook point for the new autoloader.

---

## 1. Architecture

**TypeScript owns I/O. PHP owns semantics.**

- **TS (`src/composables/useComposer.ts`, new):** HTTP to Packagist, zip download, JSZip extraction, VFS writes, IndexedDB cache, progress reporting.
- **PHP (`app/.liminal/*.php`, new, baked into `app.zip`):** version constraint solving via real `composer/semver`, version normalization, classmap scanning via `token_get_all()`, generation of `installed.php` / `installed.json` / the supplemental autoloader.

There is no JS↔PHP callback bridge in `@php-wasm/universal`. The interop pattern is:

```
TS writes JSON → /app/.liminal/tmp/in.json
TS calls php.run({ code: "<?php require '/app/.liminal/<job>.php';" })
PHP reads in.json, computes, echoes JSON
TS parses result.text
```

Keep each PHP job a **pure function of its input file**. No state between runs.

---

## 2. Phase 0 — Bake-ins (build-time, one commit)

1. In `app/`, run `composer require composer/semver`. It has zero runtime dependencies and adds ~50KB. Commit the updated `composer.json` / `composer.lock`. This lands in `app.zip` via the existing `bundle-app.js` step.
   - This gives you `Composer\Semver\Semver::satisfies()`, `Comparator`, and `VersionParser::normalize()` — the exact code real Composer uses. **Do not hand-roll constraint parsing.** `^`, `~`, `||`, `*`, stability suffixes, and `-dev` handling all have edge cases you will get wrong.
2. Create `app/.liminal/` containing the PHP jobs (Phase 2/4 below). Verify `scripts/bundle-app.js` includes dotfolders — `EXCLUDE_DIRS` is an exact-match set on relative paths and `EXCLUDE_FILES` is a filename set, so `.liminal/` is included as-is. No bundler change needed, but assert the files exist in the VFS after boot.
3. Refactor the duplicated preamble in `usePhp.ts` into one exported constant:

```ts
const PREAMBLE = `
  chdir('/app');
  require '/app/vendor/autoload.php';
  if (file_exists('/app/.liminal/autoload.php')) require '/app/.liminal/autoload.php';
`
```

Use it in `boot`, `navigateTo`, `runArtisan`, and all new jobs.

---

## 3. Phase 1 — Network access (unblock everything else)

**Verified constraint (checked live):** `codeload.github.com` responds with `access-control-allow-origin: https://render.githubusercontent.com`, not `*`. Packagist `dist.url` values point at `api.github.com/repos/.../zipball/{sha}`, which *does* send `access-control-allow-origin: *` but 302-redirects to codeload. The browser follows the redirect and the CORS check fails on the final response. **Direct browser fetch of Composer dist zips is impossible.** This is non-negotiable and must be solved first.

Recommended: a **Cloudflare Pages Function** at `functions/api/dist.ts`. You are already on Pages; this is same-origin, so CORS disappears entirely and COEP is irrelevant.

```ts
const ALLOW = [/^codeload\.github\.com$/, /^api\.github\.com$/, /^repo\.packagist\.org$/,
               /^gitlab\.com$/, /^bitbucket\.org$/]

export const onRequestGet: PagesFunction = async ({ request }) => {
  const target = new URL(request.url).searchParams.get('url')
  if (!target) return new Response('missing url', { status: 400 })
  const u = new URL(target)
  if (u.protocol !== 'https:' || !ALLOW.some(re => re.test(u.hostname)))
    return new Response('host not allowed', { status: 403 })

  const upstream = await fetch(u.toString(), {
    headers: { 'User-Agent': 'liminal-playground', Accept: '*/*' },
    cf: { cacheEverything: true, cacheTtl: 86400 },
  })
  const h = new Headers(upstream.headers)
  h.set('Access-Control-Allow-Origin', '*')
  h.set('Cross-Origin-Resource-Policy', 'cross-origin')
  h.delete('set-cookie')
  return new Response(upstream.body, { status: upstream.status, headers: h })
}
```

Notes:
- Allowlist by hostname regex — an open proxy will be abused.
- Cap response size (reject `content-length` > ~30MB) and rate-limit by IP if abuse appears.
- `cacheEverything` means Cloudflare's edge absorbs repeat downloads of popular packages for free.
- This does mean the deployment is no longer 100% static. **Update the README** — currently it claims no backend and lists "no Composer" as a limitation.

*Fully-static alternative if you want to preserve the zero-backend claim:* resolve `dist.source.url` to the GitHub repo + tag, list files via `https://data.jsdelivr.com/v1/packages/gh/{owner}/{repo}@{tag}`, and fetch each file from `https://cdn.jsdelivr.net/gh/{owner}/{repo}@{tag}/{path}`. Both are CORS-open. Cost: one request per file, so a mid-size package is 100+ round trips. Acceptable as a *fallback* when the proxy 5xxs; not as the primary path.

Metadata (`https://repo.packagist.org/p2/{vendor}/{name}.json`) is CORS-open and can be fetched directly, no proxy needed.

---

## 4. Phase 2 — Resolution

**TS driver** (`resolve()` in `useComposer.ts`):

1. Seed the queue with the requested `vendor/name` + constraint (default: `*`).
2. Seed **installed state** from the existing `/app/vendor/composer/installed.json` — the 310 packages Laravel already ships. These are pinned and must never be re-resolved or overwritten.
3. For each queued package: fetch `p2/{vendor}/{name}.json` (and `p2/{vendor}/{name}~dev.json` only if the constraint is a branch like `dev-main`). Cache responses in-memory per session.
4. Ask PHP to pick a version (below). Enqueue the winner's `require` map.
5. Skip requirements matching `php`, `php-64bit`, `hhvm`, `ext-*`, `lib-*`, `composer-*`. Optionally verify `ext-*` against `get_loaded_extensions()` and warn — do not fail.
6. Ignore `require-dev`, `suggest`, `conflict`, `replace`, `provide` for the PoC. Log conflicts; do not attempt backtracking.
7. Depth cap (~20) and total-package cap (~150) to prevent runaway trees.

**PHP job** `app/.liminal/resolve.php` — input `{ candidates: [{version, ...}], constraint: "^3.0", installed: {...} }`:

```php
<?php
use Composer\Semver\Semver;
use Composer\Semver\VersionParser;

$in = json_decode(file_get_contents('/app/.liminal/tmp/in.json'), true);
$parser = new VersionParser();

$matches = [];
foreach ($in['candidates'] as $c) {
    $v = $c['version'];
    if (($in['stability'] ?? 'stable') === 'stable'
        && VersionParser::parseStability($v) !== 'stable') continue;
    if (!Semver::satisfies($v, $in['constraint'])) continue;
    $matches[] = $c;
}
usort($matches, fn($a, $b) => Semver::rsort([$a['version'], $b['version']])[0] === $a['version'] ? -1 : 1);

echo json_encode([
    'chosen'     => $matches[0] ?? null,
    'normalized' => $matches ? $parser->normalize($matches[0]['version']) : null,
]);
```

`VersionParser::normalize()` is what produces the 4-segment `3.8.4.0` form that `installed.php` requires. That's a second reason semver is worth baking in.

---

## 5. Phase 3 — Fetch & extract

For each resolved package not already installed:

1. Check IndexedDB (Phase 5) for `zip:{name}@{version}`. Hit → skip network.
2. `fetch('/api/dist?url=' + encodeURIComponent(dist.url))`.
3. `JSZip.loadAsync()` — JSZip is already a dependency; don't add fflate for this.
4. Strip the single root folder (GitHub zipballs are `{owner}-{repo}-{sha7}/...`). The existing common-prefix logic in `runComposerRequire` is correct — port it.
5. Write to `/app/vendor/{vendor}/{name}/`, creating parents. Reuse the existing `ensureDir` helper.
6. Skip obvious dead weight: `tests/`, `docs/`, `.github/`, `*.md` — meaningfully reduces MEMFS pressure on large trees.
7. Store the raw zip bytes in IndexedDB before extracting.

Run installs **sequentially** with progress callbacks; parallel writes into the Emscripten FS are not worth the risk.

---

## 6. Phase 4 — Autoloading (the part that must be right)

**Do not touch Composer's generated files.** Leave `autoload_psr4.php`, `autoload_static.php`, and `autoload_classmap.php` byte-identical to what real Composer produced. Instead emit a supplemental autoloader that runs *after* Composer's, registered by the shared `PREAMBLE`.

`app/.liminal/generate.php` reads every dynamically-installed package's `composer.json` and writes `/app/.liminal/autoload.php`:

```php
<?php
// GENERATED — do not edit
$base = '/app/vendor/';
$psr4 = [ /* 'Vendor\\Pkg\\' => ['/app/vendor/vendor/pkg/src'] */ ];
$psr0 = [ /* ... */ ];
$classmap = [ /* 'Full\\Class\\Name' => '/app/vendor/.../File.php' */ ];
$files = [ /* '/app/vendor/vendor/pkg/src/helpers.php' */ ];

spl_autoload_register(function ($class) use ($psr4, $psr0, $classmap) {
    if (isset($classmap[$class])) { require $classmap[$class]; return; }
    foreach ($psr4 as $prefix => $dirs) {
        if (strncmp($prefix, $class, strlen($prefix)) !== 0) continue;
        $rel = str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        foreach ($dirs as $d) if (is_file($f = "$d/$rel")) { require $f; return; }
    }
    foreach ($psr0 as $prefix => $dirs) {
        if (strncmp($prefix, $class, strlen($prefix)) !== 0) continue;
        $rel = str_replace(['\\', '_'], '/', $class) . '.php';
        foreach ($dirs as $d) if (is_file($f = "$d/$rel")) { require $f; return; }
    }
}, true, false); // append — Composer's loader gets first refusal

foreach ($files as $f) require_once $f;
```

Handle all four `autoload` keys. A `psr-4` value may be a string or an array of strings — normalize to array. Also merge `autoload-dev` only for the root package, never for dependencies.

**Classmap scanning** (`app/.liminal/classmap.php`): for packages declaring `classmap`, walk the directories and extract class/interface/trait/enum names with `token_get_all()`. You have a PHP interpreter — use it rather than regexing PHP source from TypeScript.

**Composer runtime shims.** A meaningful share of packages call `Composer\InstalledVersions::isInstalled()` / `getVersion()` — Laravel itself does. Composer's real `InstalledVersions` class is already present in `vendor/composer/`; it reads `vendor/composer/installed.php`. So **regenerate `installed.php`** after each install, merging Laravel's existing entries with the new ones:

```php
return [
  'root' => [ /* preserve existing */ ],
  'versions' => [
    'vendor/pkg' => [
      'pretty_version' => 'v3.8.4',
      'version'        => '3.8.4.0',      // VersionParser::normalize()
      'reference'      => '<dist sha>',
      'type'           => 'library',
      'install_path'   => __DIR__ . '/../vendor/pkg',
      'aliases'        => [],
      'dev_requirement'=> false,
    ],
  ],
];
```

Call `InstalledVersions::reload()` after writing if anything in the same process already touched it.

**Laravel package discovery.** `Illuminate\Foundation\PackageManifest` reads `vendor/composer/installed.json` and maps each `packages[].name` to `packages[].extra.laravel` (providers + aliases). So `installed.json` entries need at minimum `name`, `version`, `extra`. The existing code already does this — keep it, but also write `install-path` (`../vendor/pkg`) since `InstalledVersions::getInstallPath()` depends on it.

Then, as the final step of an install, replace `dumpAutoload()` with:

```
php.run: PREAMBLE + artisan package:discover
```

and clear `bootstrap/cache/*.php` beforehand, or discovery will read a stale manifest.

---

## 7. Phase 5 — Persistence

MEMFS is RAM-only. Without this, every reload re-downloads the whole tree.

Use IndexedDB directly (`idb-keyval` is ~1KB if you want a wrapper; raw IDB is fine):

- `zip:{vendor}/{name}@{version}` → raw `ArrayBuffer` of the dist zip.
- `liminal:lock` → `{ [name]: { version, distUrl, reference } }` — your `composer.lock` equivalent.

Boot sequence becomes:

1. Extract `app.zip` (existing).
2. Read `liminal:lock`. For each entry, pull the cached zip from IDB and extract into `/app/vendor/`. No network.
3. Regenerate `/app/.liminal/autoload.php` + `installed.php` + `installed.json`.
4. Run `package:discover`.
5. Bootstrap Laravel (existing).

Storing zips rather than file maps keeps IDB small and lets you reuse the exact same extraction code on both paths. Add a "clear package cache" button in `ToolsView.vue` next to the existing tools.

Consider folding `liminal:lock` into the existing share-URL encoding (`useShareUrl.ts`) so a shared link reproduces the dependency set, not just file diffs.

---

## 8. Phase 6 — UI

`TerminalView.vue` already has an `artisan | composer require` dropdown. Extend the composer branch to:

- Accept `vendor/name` and `vendor/name:^3.0`.
- Stream progress lines as resolution and download proceed (`Resolving dependencies…`, `- Installing psr/log (3.0.2)`) — matching real Composer output makes the illusion land.
- Print a resolution summary before installing and, on conflict, print `Your requirements could not be resolved` with the conflicting pair rather than silently picking one.

---

## 9. Verification checklist

Test in this order — each is a distinct failure mode:

1. `nesbot/carbon` — has real transitive deps (`carbonphp/carbon-doctrine-types`, `psr/clock`, symfony packages). Some are already in Laravel's vendor; confirm they are **not** reinstalled or downgraded.
2. `ramsey/uuid` — deep tree, uses `files` autoload and `brick/math`.
3. `spatie/laravel-permission` — a Laravel package with `extra.laravel.providers`. Confirm `package:discover` picks it up and the service provider boots.
4. `symfony/var-dumper` — `files` autoload registering global functions; confirm `dump()` works in a route.
5. Install something, hard-reload, confirm zero network requests and the package still autoloads.
6. Install a package with a `^` constraint that excludes the newest release; confirm the correct older version is chosen.

---

## 10. Explicit non-goals for the PoC

- No SAT solving / backtracking. Greedy highest-match, first-wins on conflict, with a warning.
- No `require-dev`, `replace`, `provide`, `conflict` handling.
- No `composer update`, `remove`, or platform-requirement enforcement.
- No signature/integrity verification of downloaded zips.
- No Composer plugins or scripts (`post-install-cmd` etc.) — except Laravel's `package:discover`, which is invoked directly.
