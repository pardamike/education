import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: { '@content': resolve(__dirname, 'content') }
    },
    // content/ sits beside src/, outside the renderer root, so the dev server must be allowed to read it.
    server: { fs: { allow: [resolve(__dirname)] } },
    plugins: [react()]
  }
})
