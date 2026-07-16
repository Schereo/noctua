import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    // zod wird mit ins Preload-Bundle gepackt (sandbox-kompatibel), daher kein externalize
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer/src')
      }
    },
    // Vorwärmen verhindert Vites Mid-Session-Re-Optimize (führt sonst beim
    // allerersten Start zu doppelten React-Instanzen und Hook-Fehlern).
    optimizeDeps: {
      include: [
        'react',
        'react-dom/client',
        'zustand',
        '@tanstack/react-query',
        '@tanstack/react-virtual',
        'cmdk',
        'tinykeys',
        'dompurify',
        'zod'
      ]
    },
    plugins: [react(), tailwindcss()]
  }
})
