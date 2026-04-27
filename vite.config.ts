import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version),
  },
  base: command === 'build' ? '/spotykach_WAV_builder/' : '/',
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('jszip')) return 'jszip';
            if (id.includes('wavesurfer.js')) return 'wavesurfer';
            if (id.includes('lucide-react') || id.includes('react-icons')) return 'icons';
            return 'vendor';
          }
          if (id.includes('src/utils/exportUtils') || id.includes('src/utils/importUtils')) {
            return 'utils-io';
          }
        }
      }
    }
  },
  server: {
    host: true,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
}))
