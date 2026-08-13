import { defineConfig } from 'vite'

// Served as a GitHub Project Page at https://<org>.github.io/deface/, so assets
// resolve under the /deface/ subpath (use import.meta.env.BASE_URL in code).
export default defineConfig({
  base: '/deface/',
  server: {
    open: '/index.html',
    port: 8091,
    // Cross-origin isolation, which is what @brainchop/mindgrab's threaded CPU
    // module needs to instantiate at all -- it imports SharedArrayBuffer-backed
    // memory. DEV ONLY, and deliberately so: GitHub Pages cannot set response
    // headers, so the deployed site has no CPU fallback and `auto` stops at
    // WebGL2. These headers are what makes that path testable locally.
    // require-corp is safe here because every asset this app loads is
    // same-origin.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    // Empty on purpose, and NOT inherited: vite preview falls back to
    // server.headers, which would make the rehearsal cross-origin isolated when
    // the thing it rehearses -- GitHub Pages -- cannot be. Measured: preview
    // reported crossOriginIsolated true until this was added, quietly offering a
    // CPU fallback the deployed site does not have.
    headers: {},
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
