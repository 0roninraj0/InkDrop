import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  build: { outDir: 'dist', target: 'es2020', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  worker: { format: 'es' },
});
