// IIFE-bundle build for embedding in host apps that don't bundle React with
// us (like the Managed Platform Console). This config inlines React +
// ReactDOM so the output is a single, drop-in <script> tag.
//
// Usage:  npm run build:iife       (defined in package.json)
// Output: dist/widget.iife.js
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
      entry: resolve(__dirname, 'src/iife-entry.tsx'),
      name: 'BugOutManaged',
      formats: ['iife'],
      fileName: () => 'widget.iife.js',
    },
    rollupOptions: {
      // Do NOT externalize React — we bundle it so the script is fully
      // self-contained on the host page.
      external: [],
      output: {
        // No globals needed since nothing is external.
        globals: {},
      },
    },
  },
});
