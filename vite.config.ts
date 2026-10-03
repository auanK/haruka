import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const base = process.env.HARUKA_BASE_PATH ?? '/'
if (!/^\/(?:(?!\.{1,2}\/)[A-Za-z0-9._-]+\/)*$/.test(base)) {
  throw new Error('HARUKA_BASE_PATH must be "/" or an absolute path like "/repo/".')
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  base,
  plugins: [
    vue(),
    ...(process.env.HARUKA_DEVTOOLS === '1'
      ? [(await import('vite-plugin-vue-devtools')).default()]
      : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
