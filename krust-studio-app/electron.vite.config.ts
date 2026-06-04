import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // Bundle electron-updater (and its transitive debug/ms) INTO the main
    // bundle. Left external, electron-builder strips debug/ms from the asar as
    // its own build-tooling deps (shared via builder-util-runtime), crashing the
    // app at launch with "Cannot find module 'ms'".
    plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
