import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
  preview: {
    port: 43127,
    host: '127.0.0.1',
    headers: isolationHeaders,
  },
})
