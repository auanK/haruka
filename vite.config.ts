import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(async () => ({
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
