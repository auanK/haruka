import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default defineConfig(async (env) => mergeConfig(
  await viteConfig(env),
  {
    test: {
      environment: 'node',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      passWithNoTests: true,
      root: fileURLToPath(new URL('./', import.meta.url)),
      fileParallelism: false,
    },
  },
))
