import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          settings: resolve('src/preload/settings.ts'),
        },
      },
    },
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          settings: resolve('src/renderer/settings.html'),
        },
      },
    },
  },
})
