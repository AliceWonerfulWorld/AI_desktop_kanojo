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
          'private-mode': resolve('src/preload/private-mode.ts'),
          events: resolve('src/preload/events.ts'),
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
          'private-mode': resolve('src/renderer/private-mode.html'),
          events: resolve('src/renderer/events.html'),
        },
      },
    },
  },
})
