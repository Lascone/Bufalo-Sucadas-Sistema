import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

const electronExternals = [
  'electron',
  'electron-updater',
  'builder-util-runtime',
  '@ferrogestor/database',
  'pg',
  /^node:/,
];

export default defineConfig({
  // Relative asset paths so packaged Electron (file://) loads the UI
  base: './',
  build: {
    modulePreload: false,
  },
  plugins: [
    react(),
    {
      name: 'strip-crossorigin-for-electron',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin/g, '');
      },
    },
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: electronExternals,
              output: {
                entryFileNames: 'main.js',
                format: 'cjs',
              },
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: 'preload.js',
                format: 'cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
});
