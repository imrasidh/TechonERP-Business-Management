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
  build: {
    target: 'es2022',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 600,
  },
})