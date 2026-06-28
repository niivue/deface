This file provides guidance to AI agents when working with code in this repository.

## What this is

Browser-only MRI defacing. Drag in a NIfTI (or a DICOM folder), register a bundled MNI template to the scan, zero the face voxels, save the result. **No data leaves the machine** — everything runs in WebAssembly + WebGPU. Privacy is the whole point, so guard it (see "Privacy invariants").

## Commands

```bash
npm run dev        # vite dev server on http://localhost:8091
npm run build      # tsc --noEmit (typecheck) + vite build to dist/
npm run typecheck  # tsc --noEmit only
npm run preview    # serve the production build (port 4173)
npm run test:e2e   # builds first, then headless-Chromium smoke
SMOKE_FULL=1 npm run test:e2e   # also exercise the slow affine -deface path
```

`test:e2e` runs `npm run build` first (so the smoke can't pass against a stale `dist`). It boots `vite preview`, drives the real app in headless Chrome with software WebGPU (`--use-gl=angle --enable-unsafe-swiftshader`), and asserts the full path node can't reach: WebGPU attach, default image load, Apply for spm_deface, Save→download, and — when the GPU provides `shader-f16` — all four mindgrab variants (otherwise the missing-WebGPU dialog path). It fails on **any `console.error`/page error**, and fails fast if `vite preview` exits before ready (port clash). It uses the system Google Chrome channel, not Playwright's bundled browser. There is no unit-test runner and no linter beyond `tsc` — "validate before commit" means typecheck + build + smoke.

## Architecture

Single-page app, no framework. [src/main.ts](src/main.ts) is the whole UI controller; it wires DOM buttons (`#applyBtn`, `#saveBtn`, `#methodSelect`, `#dicomPick`, `#statusMsg`) to three subsystems:

- **NiiVue** (`@niivue/niivue`, WebGPU) — renders volumes. Constructed eagerly but `attachTo('gl1')` is deferred until *after* the `navigator.gpu` guard in `init()`, so a no-WebGPU browser shows a friendly message instead of an unhandled rejection.
- **niimath** (vendored under [src/niimath-gpl/](src/niimath-gpl/)) — does the defacing in a WASM worker.
- **dcm2niix** ([src/dcm2niix/](src/dcm2niix/)) — converts dropped DICOM folders to NIfTI; drop traversal uses `webkitGetAsEntry()` and stamps `_webkitRelativePath` so dcm2niix groups by series.

Three methods, selected by `#methodSelect`:
- `spm_deface` — SPM rigid coreg (`spm_coreg`, **GPL**), ~5 s. niimath chain `image(src).robustfov().spmDeface(mni, mask)` zeros face voxels over a registered MNI template.
- `deface` — AFNI 3dAllineate affine (**BSD**), ~20 s, default. Same shape, `.deface(...)`.
- `mindgrab[_robust][8]` — deep-learning brain extraction (skull-strip), needs **WebGPU + shader-f16**. See "mindgrab" below. Two orthogonal knobs encoded in the method name: the `8` suffix keeps an 8 mm tissue shell around the brain (brainchop-cli's `-close 1 8 0`, vs. a tight `-bin` strip); `robust` runs the whole pipeline on a `-robustfov`-cropped copy first (drops the neck/inferior slices). So: `mindgrab` (tight), `mindgrab_robust` (tight, cropped), `mindgrab8` (8 mm shell), `mindgrab_robust8` (8 mm shell, cropped).

### Concurrency model
Loads, drops, and defaces must not overlap. [src/main.ts](src/main.ts) serializes everything through a single promise chain (`enqueue`/`pending`) and gates buttons on `isBusy()`. This matters because the niimath wrapper has a **single-flight contract**: `run()` reassigns the worker's one `onmessage` handler, so two overlapping `run()` calls on the same `Niimath` instance cross-wire each other's results. One run at a time per instance, or use separate instances.

### Worker recovery
A failed/OOM niimath run (the WASM allocators bail via longjmp) can leave the worker's heap + MEMFS corrupt. `runDeface()` catches, calls `resetNiimathWorker()` (terminates the worker, nulls `niimathReady`), and rethrows — the next Apply spins up a fresh worker. The vendored wrapper exposes no public `terminate`, so this reaches the private `worker` field via a cast.

### Privacy invariants (do not regress)
- **`sourceFile` stays pristine.** Apply always defaces the original source, never the previous defaced output, so repeated clicks / method switches don't re-crop or degrade. The defaced result is displayed with `asSource=false`.
- **Save is gated on `hasDefaced`.** The un-defaced source must never be downloadable as `defaced.nii.gz`. The smoke test asserts Save is disabled before any deface — keep that assertion meaningful.
- **Whenever the displayed volume becomes the un-defaced source, set `hasDefaced = false`.** `makeBrainMask` loads the pristine source onto the canvas (to parse an NVImage for conform) via a raw `nv.loadVolumes`, which bypasses `loadFromFile`; it therefore clears `hasDefaced` itself. Without that, a mindgrab failure after a prior successful deface would leave Save enabled over the pristine image (the original audit P0).

## mindgrab (brain extraction)

[src/mindgrab/](src/mindgrab/) is the third method, lifted from the validated `dwi2trx` pipeline. It needs **WebGPU with `shader-f16` and a ~1.4 GB max buffer**, which is *stricter* than the rest of the app (NiiVue itself can render on WebGL2). When that's missing, `getBrainGPUDevice()` returns null and `runDeface` pops `#webgpuDialog` instead of failing.

Flow (in [src/main.ts](src/main.ts) `makeBrainMask` + the `mindgrab` branch of `runDeface`): conform the pristine source to 256³ 1 mm FreeSurfer-canonical via the `conform` VolumeTransform (a Web Worker, `transforms.ts` + `conform-worker.ts` + `conform.ts`) → normalize + transpose to the model's z-fastest order → run the tinygrad-generated model (`model.ts`, **generated, do not edit**) on its own WebGPU device → serialize labels to a conformed-space mask NIfTI (`nifti-writer.ts`). Then two serial niimath runs reslice that mask onto the native grid (`-reslice_nn`) and multiply the pristine source by it (`-mul`) so only brain survives — `mindgrab` binarizes the mask (`-bin`) for a tight strip; `mindgrab8` grows it 8 mm first (`-close 1 8 0`, brainchop-cli's trick). `resliceNN`/`mulImage` are the file-staging niimath methods added for this (see [src/niimath-gpl/index.ts](src/niimath-gpl/index.ts)).

**robustfov + mindgrab — the coordinate-space rule.** `-robustfov` changes the image extent (drops inferior slices), so you cannot conform the pristine source but reslice/mask against a cropped one — that mixes coordinate spaces and corrupts the mask (the rougher mask / stray voxels seen when robustfov ran only as a pre-step). The `mindgrab_robust8` method does it correctly: it crops once with niimath up front and feeds that **single** image through the entire pipeline (conform → infer → reslice → mul), so everything stays in one space. The plain `mindgrab`/`mindgrab8` methods skip robustfov entirely and use the pristine source throughout. The `makeBrainMask(inferer, src)` `src` parameter is exactly this "effective input" — pristine or cropped — and the reslice/mul in `runDeface` must use the same `src`.

Lifecycle: the whole thing is lazily `import()`ed on first mindgrab Apply (keeps the ~180 kB model chunk + conform worker out of the initial bundle). The device + model buffers are released in `cleanup()`; the conform `NVWorker` (a module singleton in `transforms.ts`, **not** owned by the NiiVue extension context) is terminated via the exported `disposeConformWorker()`; `maskCtx` is disposed too. On *any* mindgrab failure, `resetMaskGpu()` disposes the inferer + destroys the device so a retry re-acquires fresh GPU state (a lost device would otherwise fail every retry until reload). Weights live at [public/models/net_mindgrab.safetensors](public/models/net_mindgrab.safetensors) (a static asset, served, not bundled). `gl-matrix` is a dependency only because `conform.ts` needs it.

## Open questions / deferred audit items

From the 2026-06-28 audits (see `audit_response.md` for the full external-review replies). Fixed across the rounds: the privacy P0 (stale `hasDefaced`, now also **fail-closed** — cleared *before* the source is displayed), the GPU-state reset on failure — including model-**acquisition** failures, which run inside the `try` so they also reset, the conform-worker + `maskCtx` disposal, fully failure-isolated cleanup (every step incl. `ctx.dispose()` guarded), busy feedback during first-use model load, and `test:e2e` building first + failing fast on a port clash. Three independent security/quality verification passes on the final state returned GO / ship-it / safe-to-push. Still open, deliberately deferred:

- **GPL WASM provenance** — RESOLVED. `src/niimath-gpl/niimath.wasm` (re-vendored for mindgrab's `-reslice_nn`/`-conform`/`-close`) was rebuilt from source and **verified byte-for-byte reproducible**: niimath `f64ea66c…` + `src/GPL` submodule `d589203c…` + emcc 6.0.1 → SHA-256 `8242e33b…`. `niimath.js` is the matching pre-built glue from the same build. `src/niimath-gpl/README.md` records the verified values. Source lives at `/Users/chris/src/niimath` (GPL now a `src/GPL` submodule of `rordenlab/niimath`, not yet on npm — hence the vendored build); rebuild via `source ~/emsdk/emsdk_env.sh && cd js && GPL=1 make wasm -C ../src && bun run scripts/pre-build.ts -i src/niimath.js -o <deface>/src/niimath-gpl/niimath.js && cp src/niimath.wasm <deface>/src/niimath-gpl/`.

- **robustfov vs conform** — RESOLVED by the `mindgrab_robust8` method (whole pipeline in one cropped space; see the coordinate-space rule above). Still worth validating on a real full-head scan that robustfov meaningfully crops, since the `t1_crop` demo is already tightly cropped so the variant barely differs from `mindgrab8` there.
- **uint8 conform scaling** — `conform.ts` returns `[srcMin, 1.0]` scaling for `DT_UINT8`, which can near-binarize a uint8 input before inference. `conform.ts` is lifted verbatim from the validated `dwi2trx`/brain2print pipeline, so changing it diverges from upstream — investigate against real uint8 data before touching.
- **WebGPU limit gate** — `getBrainGPUDevice` requires a 1.4 GB `maxBufferSize`/`maxStorageBufferBindingSize`; the model's largest single buffer is ~960 MB (`model.ts`). The gate is conservative (may reject capable devices, can't prove total allocation). Inherited from the validated pipeline; refine only with device testing.
- **Smoke gaps** — `test:e2e` now builds first and fails fast on a preview port clash. Still open: the missing-WebGPU dialog branch isn't deterministically covered (it runs only when the GPU lacks f16), and the privacy P0 regression has no direct failure-injection test. Both want a `navigator.gpu`/`shader-f16` browser stub; the P0 invariant currently holds *by construction* (`hasDefaced` is cleared synchronously after the pristine source displays, and Save is also gated on `busy` for the whole run), which is why it wasn't treated as a blocker.
- **Semi-vendored `src/mindgrab/index.ts`** — repeated refactor passes noted a dead `string|ArrayBuffer|Uint8Array` union in `loadMindgrab`, the per-buffer `createTrackingDevice` shim (a hand-rolled GPUDevice proxy, redundant with `device.destroy()` and a re-vendor maintenance trap — a `Proxy` would be more robust), a dead `isConformed` fast-path, and a base `WorkerResult` interface in `transforms.ts` that only exists to be extended once. All left as-is to keep parity with the upstream lift; simplify only if you decide to own these files (and can run the smoke on real f16 hardware for the device-shim change).

## The vendored GPL WASM

[src/niimath-gpl/](src/niimath-gpl/) holds a **generated artifact** (`niimath.js`/`niimath.wasm` + wrappers copied verbatim from `rordenlab/niimath`). It is the GPL-2 build because it links the GPL `spm_coreg` module — which is why the whole app is GPL-2 and why this binary lives here rather than in the BSD `@niivue/niimath` npm package. Do not hand-edit it. To regenerate, follow [src/niimath-gpl/README.md](src/niimath-gpl/README.md) and **record the niimath + `src/GPL` submodule SHAs and the WASM SHA-256** there every time (GPL source-availability compliance; the build is byte-for-byte reproducible).

## Deploy

Pushes to `main` build and deploy to the `gh-pages` branch (`.github/workflows/ghpages.yml`), served at `https://<org>.github.io/deface/`. The `/deface/` subpath is baked in via `base: '/deface/'` in [vite.config.ts](vite.config.ts) — reference bundled assets through `import.meta.env.BASE_URL`, not absolute `/` paths. `@niivue/dcm2niix` is in `optimizeDeps.exclude` because Vite's prebundler breaks its dynamic-import WASM worker; don't remove that.
