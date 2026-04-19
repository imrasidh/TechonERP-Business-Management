import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Build-only tuning: does not alter app runtime behavior.
 * - Larger heap helps avoid OOM during minification on large bundles (Windows/CI).
 * - reportCompressedSize: false reduces post-build work (fewer moving parts during emit).
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    // Build metadata only (boolean), avoids exposing actual secret in renderer bundles.
    __TC_BUILD_HAS_LICENSE_SECRET__: JSON.stringify(
      Boolean((process.env.LICENSE_SECRET || process.env.TC_LIC_SERVER_SECRET || "").trim())
    ),
  },
  build: {
    target: 'es2022',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /** Split vendor only; same module graph, different chunk filenames (no runtime logic change). */
        manualChunks(id) {
          const n = id.split('\\').join('/')
          if (n.includes('node_modules/react-dom')) return 'vendor-react-dom'
          if (n.includes('node_modules/react/')) return 'vendor-react'
          return undefined
        },
      },
    },
  },
})