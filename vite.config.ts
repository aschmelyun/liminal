import { defineConfig } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { onRequestGet as proxyComposerRequest } from './functions/api/dist'

function composerProxy(): Plugin {
  const middleware = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (!request.url?.startsWith('/api/dist')) {
      next()
      return
    }
    if (request.method !== 'GET') {
      response.statusCode = 405
      response.end('method not allowed')
      return
    }

    try {
      const origin = `http://${request.headers.host || 'localhost'}`
      const proxyResponse = await proxyComposerRequest({
        request: new Request(new URL(request.url, origin)),
      })
      response.statusCode = proxyResponse.status
      proxyResponse.headers.forEach((value, key) => response.setHeader(key, value))
      response.end(Buffer.from(await proxyResponse.arrayBuffer()))
    } catch (error: any) {
      response.statusCode = 502
      response.end(error?.message || 'Composer proxy request failed')
    }
  }

  return {
    name: 'liminal-composer-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), composerProxy()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@php-wasm/web-8-4'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
