import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const base = process.env.VITE_BASE_PATH ||
    (process.env.GITHUB_ACTIONS || isProduction ? '/mosaic/' : '/')

  return {
    base,
    plugins: [
      tailwindcss(),
    ],
    optimizeDeps: {
      include: ['maplibre-gl'],
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  }
})
