import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoBase = process.env.VITE_BASE_PATH || '/kakuti/'

// https://vitejs.dev/config/
export default defineConfig({
  base: repoBase,
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist']
        }
      }
    }
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})