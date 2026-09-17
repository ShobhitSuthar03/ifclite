import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

/** @ifc-lite packages ship .js.map files whose sources are not published. */
function quietIfcLiteSourcemaps() {
  return {
    name: 'quiet-ifc-lite-sourcemaps',
    configureServer(server: { config: { logger: { warn: (msg: string, options?: unknown) => void } } }) {
      const warn = server.config.logger.warn.bind(server.config.logger)
      server.config.logger.warn = (msg: string, options?: unknown) => {
        if (msg.includes('points to missing source files') && msg.includes('@ifc-lite')) return
        warn(msg, options)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), quietIfcLiteSourcemaps()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@ifc-lite/wasm'],
  },
  clearScreen: false,
  server: {
    port: 43127,
    strictPort: true,
    host: '127.0.0.1',
    headers: isolationHeaders,
    watch: {
      ignored: ['**/src-tauri/**', '**/.mcp.json', '**/.cursor/**'],
    },
  },
  preview: {
    port: 43127,
    host: '127.0.0.1',
    headers: isolationHeaders,
  },
})
