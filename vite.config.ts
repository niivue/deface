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
  // Vite's dev dep-prebundler (esbuild) trips on the `new Worker(new URL(...))`
  // WASM worker in these packages — it can't resolve the worker module under
  // .vite/deps. Exclude them so the worker stays a standalone module whose runtime
  // URL resolves. (Production `vite build` uses Rollup and handles it either way;
  // this is dev-mode only.) Both @niivue/dcm2niix and @niivue/niimath ship such a worker.
  optimizeDeps: {
    exclude: ['@niivue/dcm2niix', '@niivue/niimath'],
  },
})
