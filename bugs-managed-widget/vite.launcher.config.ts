// Builds the Managed Platform Unified Launcher as a self-contained IIFE.
// Output: dist/launcher.iife.js
// Served from: bugout-api.managedplatform.com/launcher.iife.js
//
// Usage:  npm run build:launcher
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/unified-launcher-entry.tsx'),
      name: 'ManagedLauncher',
      formats: ['iife'],
      fileName: () => 'launcher.iife.js',
    },
    rollupOptions: {
      // Bundle React — fully self-contained, no host dependencies.
      external: [],
      output: { globals: {} },
    },
  },
});
