import { defineConfig } from 'vite'

// Served as a GitHub Project Page at https://<org>.github.io/deface/, so assets
// resolve under the /deface/ subpath (use import.meta.env.BASE_URL in code).
export default defineConfig({
  base: '/deface/',
  server: {
    open: '/index.html',
    port: 8091,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
  },
  // Vite's dep prebundler trips on the dynamic-import WASM worker in
  // @niivue/dcm2niix, so exclude it (keeps the worker a standalone module whose
  // runtime URL resolves). The GPL niimath is vendored under src/, not a
  // node_modules dependency, so it isn't prebundled and needs no exclude.
  optimizeDeps: {
    exclude: ['@niivue/dcm2niix'],
  },
})
