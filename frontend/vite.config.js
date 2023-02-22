import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import { ViteEjsPlugin } from 'vite-plugin-ejs';

import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue(), ViteEjsPlugin],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(
        new URL('./node_modules', import.meta.url)
      )
    }
  }
})
