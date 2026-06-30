This file provides guidance to AI agents when working with code in this repository.

## What this is

Browser-only MRI defacing. Drag in a NIfTI (or a DICOM folder), register a bundled MNI template (or run a brain-extraction model), zero the non-brain/face voxels, save the result. **No data leaves the machine** — everything runs in WebAssembly + WebGPU. Privacy is the whole point (see "Privacy invariants").

## Commands

```bash
npm run dev        # vite dev server on http://localhost:8091
npm run build      # tsc --noEmit (typecheck) + vite build to dist/
npm run typecheck  # tsc --noEmit only
npm run preview    # serve the production build (port 4173)
npm run test:e2e   # builds first, then headless-Chromium smoke
SMOKE_FULL=1 npm run test:e2e   # also exercise the slow affine -deface path
```

No unit-test runner, no linter beyond `tsc` — "validate before commit" = typecheck + build + smoke. `test:e2e` builds first (so it can't pass against a stale `dist`), boots `vite preview` (failing fast on a port clash), and drives the real app in system Chrome with software WebGPU (`--use-gl=angle --enable-unsafe-swiftshader`). It exercises spm_deface + Save + (when the GPU has `shader-f16`) all four mindgrab variants, and **fails on any `console.error`/page error** — keep that gate meaningful (a handled capability-absence should `console.warn`, not `error`).

## Architecture

Single-page app, no framework. [src/main.ts](src/main.ts) is the whole UI controller, wiring DOM buttons (`#applyBtn`, `#saveBtn`, `#methodSelect`, `#dicomPick`, `#statusMsg`) to three subsystems:

- **NiiVue** (`@niivue/niivue`, WebGPU) — renders volumes. Constructed eagerly, but `attachTo('gl1')` is deferred to `init()` behind a guard: `init()` checks `navigator.gpu` *and* try/catches `attachNiiVue()`, so every WebGPU-unavailable path (no adapter, device-creation failure, blocklisted GPU) shows a friendly message instead of an unhandled rejection.
- **niimath** (vendored GPL build, [src/niimath-gpl/](src/niimath-gpl/)) — does the defacing in a WASM worker.
- **dcm2niix** ([src/dcm2niix/](src/dcm2niix/)) — converts dropped DICOM folders to NIfTI; drop traversal uses `webkitGetAsEntry()` and stamps `_webkitRelativePath` so dcm2niix groups by series.

Methods, selected by `#methodSelect`:
- `spm_deface` — SPM rigid coreg (`spm_coreg`, **GPL**), ~5 s. `image(src).robustfov().spmDeface(mni, mask)` zeros face voxels over a registered MNI template.
- `deface` — AFNI 3dAllineate affine (**BSD**), ~20 s, default. Same shape, `.deface(...)`.
- `mindgrab[_robust][8]` — deep-learning brain extraction (skull-strip), needs **WebGPU + shader-f16**. See "mindgrab". Two orthogonal knobs in the name: `8` keeps an 8 mm tissue shell (brainchop-cli's `-close 1 8 0`, vs. a tight `-bin`); `robust` runs the pipeline on a `-robustfov`-cropped copy (drops neck/inferior slices). → `mindgrab` (tight), `mindgrab_robust`, `mindgrab8`, `mindgrab_robust8`.

### Concurrency — single-flight (gotcha)
Loads, drops, and defaces must not overlap: everything is serialized through one promise chain (`enqueue`/`pending`), buttons gated on `isBusy()`. Required because the niimath wrapper reassigns the worker's one `onmessage` handler per `run()`, so two overlapping `run()`s on the same `Niimath` instance cross-wire each other's results. One run at a time per instance, or use separate instances.

### Worker recovery (gotcha)
A failed/OOM niimath run (WASM allocators bail via longjmp) can corrupt the worker heap + MEMFS. `runDeface()` catches → `resetNiimathWorker()` (terminates the worker via a cast to the private `worker` field — the vendored wrapper has no public `terminate`) → rethrows; the next Apply spins up a fresh worker. mindgrab failures also call `resetMaskGpu()` (dispose inferer + destroy device) so a lost GPU device doesn't fail every retry until reload.

### Privacy invariants (do not regress)
- **`sourceFile` stays pristine.** Apply always defaces the original source, never the previous defaced output. The defaced result is displayed with `asSource=false`.
- **Save is gated on `hasDefaced`** (plus a runtime `hasDefaced && !isBusy()` guard inside `runSave`). The un-defaced source must never download as `defaced.nii.gz`. The smoke asserts Save is disabled pre-deface — keep it meaningful.
- **Clear `hasDefaced` *before* displaying any un-defaced source** (fail-closed). Done in `loadFromFile` (source loads) and `makeBrainMask` (which uses raw `nv.loadVolumes`, bypassing `loadFromFile`, so it must clear `hasDefaced` itself). A failed source load also clears `sourceFile` so Apply can't target a stale source that diverges from the display.

## mindgrab (brain extraction)

[src/mindgrab/](src/mindgrab/) is lifted from the validated `dwi2trx`/brain2print pipeline. Needs **WebGPU with `shader-f16` and ~1.4 GB max buffer** — stricter than the rest of the app (NiiVue renders on WebGL2). When missing, `getBrainGPUDevice()` returns null and `runDeface` pops `#webgpuDialog` instead of failing.

Flow (`makeBrainMask` + the `mindgrab` branch of `runDeface`): conform the model input to 256³ 1 mm FreeSurfer-canonical via the `conform` VolumeTransform (a Web Worker: `transforms.ts` + `conform-worker.ts` + `conform.ts`) → normalize + transpose to the model's z-fastest order → run the tinygrad-generated model (`model.ts`, **generated, do not edit**) on its own WebGPU device → serialize labels to a conformed-space mask NIfTI (`nifti-writer.ts`). Then two serial niimath runs reslice the mask onto the native grid (`-reslice_nn`) and `-mul` the source by it; `mindgrab` binarizes (`-bin`), `mindgrab8` grows 8 mm first (`-close 1 8 0`). `resliceNN`/`mulImage` are file-staging niimath methods added for this.

**Output resolution — model space vs native space (gotcha; the brainchop `-i` inverse).** The model segments in 256³ 1 mm, but output must be at the *input* resolution (like spm_deface/deface), cropped if robustfov — e.g. 0.75 mm in → 0.75 mm out, not downsampled. So `runDeface` splits two roles:
- `srcModel` — the model input (must be conformed 256³ 1 mm), passed to `makeBrainMask`; the returned mask is in conformed space.
- `srcNative` — the reslice/mul target (native res). The conformed mask is `-reslice_nn`'d back onto `srcNative`'s grid and `srcNative` is `-mul`'d by it.

Plain `mindgrab`/`mindgrab8`: `srcModel = srcNative = sourceFile`; `prepareInput` conforms via the niivue worker (or skips it for an already-256³ input via the `isConformed` fast-path). Robustfov variants: `srcNative = niimath sourceFile -robustfov` (native, cropped), `srcModel = niimath srcNative -conform` (256³ 1 mm). Both share one world frame (one `-robustfov` crop), so the conformed mask reslices back onto `srcNative` with exact sform alignment. The `-conform` is **essential**: robustfov's non-256³ crop would otherwise route `prepareInput` through the niivue conform worker, which mishandles cropped geometry and wrecks the mask; `niimath -conform` restores the exact canonical orientation the model expects.

Lifecycle: lazily `import()`ed on first mindgrab Apply (keeps the ~180 kB model chunk + conform worker out of the initial bundle). `cleanup()` releases device + model buffers, disposes `maskCtx`, and terminates the conform `NVWorker` via `disposeConformWorker()` — a `transforms.ts` module singleton **not** owned by the NiiVue extension context, so it must be torn down explicitly. Weights: [public/models/net_mindgrab.safetensors](public/models/net_mindgrab.safetensors) (static asset, served, not bundled). `gl-matrix` is a dependency only because `conform.ts` needs it.

## The vendored GPL WASM

[src/niimath-gpl/](src/niimath-gpl/) holds a **generated artifact** (`niimath.js`/`niimath.wasm` + wrappers from `rordenlab/niimath`). It's the GPL-2 build because it links GPL `spm_coreg` — which is why the whole app is GPL-2 and this binary lives here, not in the BSD `@niivue/niimath` npm package. **Do not hand-edit.** The wrapper's `run()` stages the primary input under a generated `__nimi_` name (not the raw user filename), so a user file named like a fixed output (e.g. re-dropping `defaced.nii.gz`) can't collide with input/output in MEMFS.

Provenance (GPL source-availability; the build is byte-for-byte reproducible — record on every re-vendor in [src/niimath-gpl/README.md](src/niimath-gpl/README.md)): niimath `f64ea66c…` + `src/GPL` submodule `d589203c…` + emcc 6.0.1 → WASM SHA-256 `8242e33b…`. Source at `/Users/chris/src/niimath` (GPL is now a `src/GPL` submodule of `rordenlab/niimath`, not yet on npm — hence the vendored build). Rebuild: `source ~/emsdk/emsdk_env.sh && cd niimath/js && GPL=1 make wasm -C ../src && bun run scripts/pre-build.ts -i src/niimath.js -o <deface>/src/niimath-gpl/niimath.js && cp src/niimath.wasm <deface>/src/niimath-gpl/`.

## Deploy

Push to `main` builds + deploys to `gh-pages` (`.github/workflows/ghpages.yml`), served at `https://<org>.github.io/deface/`. The `/deface/` subpath is baked in via `base: '/deface/'` in [vite.config.ts](vite.config.ts) — reference bundled assets through `import.meta.env.BASE_URL`, not absolute `/`. `@niivue/dcm2niix` is in `optimizeDeps.exclude` because Vite's prebundler breaks its dynamic-import WASM worker; don't remove that.

## Open issues & deliberate non-fixes

- **uint8 conform scaling** — `conform.ts` returns `[srcMin, 1.0]` for `DT_UINT8`, which can near-binarize a uint8 input before inference. `conform.ts` is verbatim from upstream `dwi2trx`/brain2print, so changing it diverges — investigate against real uint8 data first. (Robustfov variants sidestep it: they feed the float32 `-conform` output.)
- **WebGPU limit gate** — `getBrainGPUDevice` requires 1.4 GB `maxBufferSize`/`maxStorageBufferBindingSize`; the model's largest single buffer is ~960 MB. Conservative (may reject capable devices, can't prove total allocation). Inherited from upstream; refine only with device testing.
- **Smoke gap: native-resolution invariant isn't asserted** — the default `t1_crop` fixture is 256³ 1 mm (the fast path). Native-res output was verified manually on a 0.75 mm scan (→ 0.75 mm, robustfov cropped 320→227); a permanent assertion needs a non-1 mm fixture, which the single-default-image smoke can't load without a drop-simulation/load hook. The missing-WebGPU dialog branch is likewise only covered opportunistically (when the GPU lacks f16).
- **Semi-vendored `src/mindgrab/index.ts`** — has a dead `string|ArrayBuffer|Uint8Array` union in `loadMindgrab`, a hand-rolled `createTrackingDevice` GPUDevice proxy (redundant with `device.destroy()`; a real `Proxy` would be more robust), a dead `isConformed` fast-path, and a single-use `WorkerResult` base interface. Left as-is for upstream parity; simplify only if you decide to own these files (and can smoke on real f16 hardware).
- **Declined refactors** (raised repeatedly, deliberately kept): the mindgrab globals (`maskCtx`/`maskDevice`/`maskInferer`/`conformRegistered` + reset/cleanup) are NOT wrapped in a resource-owner object, and `hasDefaced` stays a boolean rather than a displayed-volume state machine. For a single-controller no-framework app both would add lines without deleting any, and the boolean is *easier* to audit for the privacy P0 (two grep-able assignment sites vs. an FSM's edges).
