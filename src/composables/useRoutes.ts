import { computed, ref } from 'vue'
import { usePhp, PREAMBLE, CONSOLE_ENV } from './usePhp'

export interface AppRoute {
  uri: string
  name: string | null
  action: string
  methods: string[]
  /** Registered by a package or the framework itself rather than the app. */
  vendor: boolean
}

const VENDOR_STORAGE = 'liminal-routes-show-vendor'

// Module-level: the preview toolbar and anything else listing routes share one
// fetch and one visibility preference.
const routes = ref<AppRoute[]>([])
const loading = ref(false)
const error = ref('')
const showVendor = ref(localStorage.getItem(VENDOR_STORAGE) === 'true')

// -1 means "never loaded"; otherwise the vfsVersion the list was built from.
let loadedVersion = -1

export function useRoutes() {
  const { query, vfsVersion, booted } = usePhp()

  /**
   * Only GET routes are listed — the preview issues GET requests through the
   * HTTP kernel, so anything else could never be rendered from the address bar.
   */
  async function refresh() {
    if (loading.value) return
    loading.value = true
    error.value = ''

    const version = vfsVersion.value
    try {
      const result = await query<{ error?: string; routes?: AppRoute[] }>(`<?php
        ${CONSOLE_ENV}
        ${PREAMBLE}
        try {
          $app = require_once '/app/bootstrap/app.php';
          $kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
          $kernel->bootstrap();

          $routes = [];
          foreach (Illuminate\\Support\\Facades\\Route::getRoutes() as $route) {
            $methods = $route->methods();
            if (!in_array('GET', $methods, true)) continue;

            /*
             * Mirrors RouteListCommand::isVendorRoute() — a route belongs to a
             * package when the closure or controller behind it lives under
             * vendor/. The framework's own view/redirect shims are excluded so
             * a user-written Route::view() still counts as an app route.
             */
            $uses = $route->getAction('uses');
            $controller = ltrim((string) $route->getControllerClass(), '\\\\');
            $framework = in_array($controller, [
              'Illuminate\\\\Routing\\\\ViewController',
              'Illuminate\\\\Routing\\\\RedirectController',
            ], true);

            $file = null;
            if (!$framework) {
              try {
                if ($uses instanceof Closure) {
                  $file = (new ReflectionFunction($uses))->getFileName();
                } elseif ($controller !== '' && class_exists($controller)) {
                  $file = (new ReflectionClass($controller))->getFileName();
                }
              } catch (Throwable $e) {
                $file = null;
              }
            }

            $routes[] = [
              'uri' => '/' . ltrim($route->uri(), '/'),
              'name' => $route->getName(),
              'action' => $route->getActionName(),
              'methods' => array_values(array_diff($methods, ['HEAD'])),
              'vendor' => is_string($file) && str_starts_with($file, '/app/vendor/'),
            ];
          }

          echo json_encode(['routes' => $routes]);
        } catch (Throwable $e) {
          echo json_encode(['error' => $e->getMessage()]);
        }
      `)

      if (result.error) throw new Error(result.error)

      // Two entries can share a URI (different verbs on the same path); the
      // address bar only cares about the path, so keep the first of each.
      const seen = new Set<string>()
      const unique: AppRoute[] = []
      for (const route of result.routes ?? []) {
        if (seen.has(route.uri)) continue
        seen.add(route.uri)
        unique.push(route)
      }

      routes.value = unique.sort(
        (a, b) => Number(a.vendor) - Number(b.vendor) || a.uri.localeCompare(b.uri),
      )

      loadedVersion = version
    } catch (err: any) {
      error.value = err.message || 'Failed to read the route list'
      routes.value = []
    } finally {
      loading.value = false
    }
  }

  /** Load the list, or rebuild it if the filesystem changed since last time. */
  async function ensureLoaded() {
    if (!booted.value) return
    if (loadedVersion === vfsVersion.value) return
    await refresh()
  }

  const visibleRoutes = computed(() => (
    showVendor.value ? routes.value : routes.value.filter((route) => !route.vendor)
  ))

  function setShowVendor(value: boolean) {
    showVendor.value = value
    localStorage.setItem(VENDOR_STORAGE, String(value))
  }

  return { routes, visibleRoutes, loading, error, showVendor, setShowVendor, refresh, ensureLoaded }
}
