/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Direct access to monaco's ESM tree (its package exports map hides .css and worker files).
      'monaco-esm': fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['isomorphic-git', '@isomorphic-git/lightning-fs', 'node-diff3', 'diff'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/monaco-editor') || id.includes('monaco-editor/esm')) return 'monaco'
          if (/node_modules\/(isomorphic-git|@isomorphic-git|node-diff3|diff)\//.test(id)) return 'git'
          if (id.includes('node_modules/@xterm')) return 'xterm'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30000,
  },
})
