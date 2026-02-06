import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/spotykach_WAV_builder/' : '/',
  build: {
    assetsInlineLimit: 0,
  },
}))
