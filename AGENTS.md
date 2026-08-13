This file provides guidance to AI agents when working with code in this repository.

## What this is

Browser-only MRI defacing. Drag in a NIfTI (or a DICOM folder), register a bundled MNI template (or run a brain-extraction model), then either zero the non-brain/face voxels or composite a synthetic surface over them, and save the result. **No data leaves the machine** — everything runs in WebAssembly + WebGPU. Privacy is the whole point (see "Privacy invariants").

## Commands

```bash
npm run dev        # vite dev server on http://localhost:8091
npm run build      # tsc --noEmit (typecheck) + vite build to dist/
npm run typecheck  # tsc --noEmit only
npm run preview    # serve the production build (port 4173)
npm run test:e2e   # builds first, then headless-Chromium smoke
SMOKE_FULL=1 npm run test:e2e   # also exercise the slow affine -deface path
```

No unit-test runner, no linter beyond `tsc` — "validate before commit" = typecheck + build + smoke. `test:e2e` builds first (so it can't pass against a stale `dist`), boots `vite preview` (failing fast on a port clash), and drives the real app in system Chrome with software WebGPU (`--use-gl=angle --enable-unsafe-swiftshader`). It exercises the default allineate (fast) deface + Save, asserts the `#imageSelect` picker is populated and defaulted to `t1_crop`, runs one `reface` (a distinct niimath op + the lazy ~10 MB template fetch), and takes one mindgrab outcome (a completed run, the capability dialog, or a NAMED refusal — an unrecognised failure string still fails) (+ one allineate (Hellinger) run under `SMOKE_FULL=1`), and **fails on any `console.error`/page error** — keep that gate meaningful (a handled capability-absence should `console.warn`, not `error`).

## Architecture

Single-page app, no framework. [src/main.ts](src/main.ts) is the whole UI controller, wiring DOM buttons (`#applyBtn`, `#saveBtn`, `#methodSelect`, `#imageSelect`, `#dicomPick`, `#statusMsg`) to three subsystems:

- **NiiVue** (`@niivue/niivue`, WebGPU) — renders volumes. Constructed eagerly, but `attachTo('gl1')` is deferred to `init()` behind a guard: `init()` checks `navigator.gpu` *and* try/catches `attachNiiVue()`, so every WebGPU-unavailable path (no adapter, device-creation failure, blocklisted GPU) shows a friendly message instead of an unhandled rejection.
- **niimath** (`@niivue/niimath`, the **BSD** build) — does the defacing in a WASM worker. See "niimath (the BSD build)".
- **dcm2niix** ([src/dcm2niix/](src/dcm2niix/)) — converts dropped DICOM folders to NIfTI; drop traversal uses `webkitGetAsEntry()` and stamps `_webkitRelativePath` so dcm2niix groups by series.

Methods, selected by `#methodSelect`. All niimath runs pass `.gz(0)` (uncompressed `.nii` I/O — no per-run gzip; NiiVue re-gzips only on Save). The `allineate*` group is `-deface` (affine registration of a bundled MNI template + face mask, **BSD**), differing only by registration engine and an optional FOV crop:
- `allineate` — fast registration engine (implicit `-cost`; Hellinger MI with a robust Hellinger fallback on degenerate inputs), no crop. **Default.** `image(src).gz(0).deface(mni, mask)`.
- `allineate_robustfov` — same fast engine after `image(src).gz(0).robustfov()` crops the neck/inferior slices for a tighter face mask.
- `allineate_hel` — the exhaustive Hellinger engine, `.deface(mni, mask, ['-cost', 'hel'])`; slower (~20 s single-thread WASM), reference-quality fit.
- `allineate_hel_robustfov` — the Hellinger engine after a `-robustfov` crop.

Engine and crop are orthogonal: `useHel = method.includes('_hel')`, `useRobustfov = method.includes('robustfov')`.

- `reface` / `reface_robustfov` / `rescalp` / `rescalp_robustfov` — **replace** the surface with a synthetic one instead of zeroing it: `-reface <tmpl> <shell> <weight>` (`niimath.image(src).gz(0)[.robustfov()].reface(tmpl, shell, weight)`). The **shell** picks what is replaced — `refacer_shell_sym212` = face, `refacer_shell_sym211` = scalp — with `MNI152_2009_SSW` as the template and `MNI152_2009_SSW_weight` as the registration weight. **Gotcha:** unlike `-deface`, reface back-projects onto the **ORIGINAL subject grid**, so `-robustfov` here only tightens the registration — the output keeps the input's full extent (verified: 0.88 mm input → same dims out, with or without the crop). The four templates are ~10 MB, so they are fetched **lazily** on the first reface Apply (`ensureRefaceFiles`), not in `init()`. **T1-weighted only** (labelled "(T1 only)" in the dropdown): the shell carries T1-like intensities, so compositing onto T2/FLAIR/PD/CT gives a surface that doesn't match the host image — this is an advisory label, not an enforced gate (the app does not sniff the contrast).
- `mindgrab[_robust][8]` — deep-learning brain extraction (skull-strip) via @brainchop/mindgrab, on WebGPU / WebGL2 / threaded CPU. See "mindgrab". Two orthogonal knobs in the name: `8` passes `borderMm: 8` to keep an 8 mm tissue shell instead of a tight strip; `robust` runs it on a `-robustfov`-cropped copy (drops neck/inferior slices). → `mindgrab` (tight), `mindgrab_robust`, `mindgrab8`, `mindgrab_robust8`.

### Image picker (`#imageSelect`, far LEFT of the toolbar)
It is the first control in `header .row` (label + select), ahead of Method/Apply/Save; only the About button is right-justified (`.push-right`). Lets a user evaluate anonymization on scans other than the bundled default (modelled on the "Moving" picker in the sibling EdgeReg app). `IMAGE_PRESETS[0]` is the bundled `t1_crop` (188×256×190, 0.88 mm, uint8 — already cropped, so the remote full-head presets are the ones where defacing visibly matters); the rest stream from `niivue-demo-images` via raw.githubusercontent (nothing downloads until chosen; `chris_t1` is deliberately omitted — it is the same scan as the bundled `t1_crop`). A hidden `__custom` entry is revealed as `(dropped) <name>` whenever a drag-drop/DICOM file becomes the source, so the picker never claims a preset is displayed when it isn't; a failed fetch **or** a failed parse restores the picker to `imageSelection` — the last source that loaded *successfully*, which on a parse failure is not what is on screen (the canvas is blank/partial); that is a label nit only, since `loadFromFile`'s catch nulls `sourceFile` and `hasDefaced` is already false, so Apply and Save are both disabled. Changes go through `enqueue()` like every other load, and the select is disabled while busy. Loading a preset uses `loadFromFile(file)` (`asSource=true`), so **`hasDefaced` is cleared before the swap is displayed** — Save can never stay enabled over a freshly swapped, un-defaced scan (verified manually; the smoke only asserts the picker is populated and defaulted to `t1_crop`, since selecting a remote image would make it depend on the network).

### Concurrency — single-flight (gotcha)
Loads, drops, and defaces must not overlap: everything is serialized through one promise chain (`enqueue`/`pending`), buttons gated on `isBusy()`. The niimath wrapper also rejects overlapping runs on its single worker, but the app queue is still required to keep viewer loads and processing in a consistent order.

### Worker recovery (gotcha)
A failed/OOM niimath run (WASM allocators bail via longjmp) can corrupt the worker heap + MEMFS. `runDeface()` catches → `resetNiimathWorker()` (calls the wrapper's public `dispose()`) → rethrows; the next Apply spins up a fresh worker. mindgrab needs no equivalent: its module and GPU device live inside a worker the package terminates per call, so a lost device cannot outlive one Apply. Its `no-webgpu` code is caught separately and pops `#webgpuDialog` — a refusal, not a failure.

**`cleanup()` disposes the worker FIRST, then does NOT await `pending`.** A niimath `run()` is a single uninterruptible WASM call (a Hellinger fit has no `isCleanedUp` checkpoint inside it), so awaiting the queue on HMR/tab-close would stall teardown for minutes. `cleanup()` sets `isCleanedUp`, calls `dispose()` (which terminates the worker and rejects the in-flight run), disposes the GPU/conform-worker/contexts, and `nv.destroy()`s. Queued loads return before touching the destroyed viewer, and enqueue suppresses the expected teardown rejection.

### Privacy invariants (do not regress)
- **`sourceFile` stays pristine.** Apply always defaces the original source, never the previous defaced output. The defaced result is displayed with `asSource=false`.
- **Save is gated on `hasDefaced`** (plus a runtime `hasDefaced && !isBusy()` guard inside `runSave`). The un-defaced source must never download as `defaced.nii.gz`. The smoke asserts Save is disabled pre-deface — keep it meaningful.
- **Clear `hasDefaced` *before* displaying any un-defaced source** (fail-closed). Done in `loadFromFile` (source loads) and `brainExtract` (which runs before any result is displayed, so it drops Save eligibility up front). A failed source load also clears `sourceFile` so Apply can't target a stale source that diverges from the display.

## mindgrab (brain extraction)

Comes from **[@brainchop/mindgrab](https://www.npmjs.com/package/@brainchop/mindgrab)**, one
`segment()` call in `brainExtract()`. The whole chain — conform to 256³ 1 mm, normalise, the
MeshNet layers, largest-connected-component, the mm border, and the reslice back onto the input
grid — runs inside that package's wasm module, so this app holds no model, no GPU device and no
state for it. `src/mindgrab/` (3,482 lines of hand-written WebGPU + a conform worker + a NIfTI
writer) and `public/models/net_mindgrab.safetensors` were deleted when it landed; do not
reintroduce a second implementation.

**Backends.** The package probes WebGPU, then WebGL2, then a threaded CPU module, and refuses
rather than downgrading silently. Measured in Chromium on an M4 Pro: webgpu 2.1 s, webgl2 3.8 s,
cpu 10.1 s. The status line reports which one ran, so a bug report says so too. The CPU module
needs a **cross-origin isolated** page: `vite.config.ts` sets COOP/COEP for `server` only, since
GitHub Pages cannot set headers — so the deployed site stops at WebGL2, and `preview.headers` is
explicitly empty so the rehearsal does not quietly offer a fallback the real site lacks.

**Assets.** `scripts/copy-brainchop.mjs` stages seven files into `public/brainchop/` on every
`dev` and `build`, and `assetPath` points there. They cannot be imported normally: the package
loads its emscripten glue by a computed URL and each glue file finds its own `.wasm` through its
own `import.meta.url`, so Vite neither rewrites the import nor emits the assets, and the pair
must stay adjacent and unhashed. MindGrab's three backend pairs only — the package also carries
the 18-class model, which this app never asks for. Wired with `&&` rather than as `pre` scripts
because bun and npm disagree about those.

**`worker: true`, always.** The WebGL2 module is synchronous, so on the main thread it freezes
the page for seconds; the worker also makes `timeoutMs` a real cancellation. The package creates
and terminates that worker per call, which is why `cleanup()` releases nothing for mindgrab.

**Output space.** The module reslices onto the input image's own grid, so the output is already
at the input resolution — no `-reslice_nn`, no `-mul`. `-robustfov` remains a niimath pre-step
and the strip then runs on that crop, so only one image and one world frame are ever in play.

**Non-brain voxels are floored to the image MINIMUM, not to zero.** The old chain multiplied by a
binary mask. Measured on the bundled subject at 8 mm: the new output is a strict subset of the
old — 18,391 of 19.2M voxels removed that the old path kept, none the other way — because the
border is grown on the conformed grid before reslicing rather than on the native one after. That
is the safe direction for a defacer, and the fixture's minimum is 0, so the floor is a no-op
there. If strict zeros are ever required, ask for `mask: true` and multiply.

## niimath (the BSD build)

Defacing runs a **BSD-2** build of niimath, so the whole app is BSD-2. No GPL/`spm_coreg` anymore: the fast affine `-deface` engine replaced the SPM rigid path. Only BSD ops are used (`-allineate`/`-deface`/`-reface`, plus `-robustfov`/`-conform`/`-reslice_nn`/`-mul`/`-bin`/`-close`); the SPM ops are neither built nor shipped.

**Standard npm dependency:** `"@niivue/niimath": "1.3.3"` in `package.json`; `main.ts` imports `{ Niimath } from '@niivue/niimath'`. 1.3.3 is the first release to carry both the fast `-deface` engine (`-cost fast` default with Hellinger fallback; `-cost hel` exhaustive) **and** `-reface` — so the previously-vendored `src/niimath/` local build is gone. The package ships its own worker + wasm; production `vite build` (Rollup) emits `worker.js` + `niimath.wasm` as hashed assets, but `npm run dev` (esbuild dep-prebundler) can't resolve its `new Worker(new URL('./worker.js', …))` worker, so **`@niivue/niimath` must be in `optimizeDeps.exclude`** (same as `@niivue/dcm2niix`; see [vite.config.ts](vite.config.ts)). API used, all public: `deface(tmpl, mask, opts)`, `reface(tmpl, shell, weight)`, `resliceNN(ref)`, `mulImage(img)`, `dispose(reason)`.

Because niimath is now plain app source (not a node_module), Vite/Rollup emit its `new Worker(new URL('./worker.js', import.meta.url))` worker + `new URL('niimath.wasm', import.meta.url)` binary as hashed assets in both dev and build — so it needs **no `optimizeDeps.exclude`** entry (that was only for the prebundled node_module; `@niivue/dcm2niix` still needs it).

**Package API (all in [src/main.ts](src/main.ts)):**
- **Primary-input staging is the wrapper's job.** Call `niimath.image(file)` directly. This BSD build's `run()` renames the primary input to `__nimi_<name>` in MEMFS, so a source named like a fixed output (a dropped `defaced.nii.gz`) can't share a path with the output — the input/output collision guard (a privacy invariant). The app no longer duplicates that prefix. The guarantee lives in the pinned + integrity-locked package; **re-verify it on any dep bump** (the collision case is not yet covered by the smoke — see "Remaining smoke gaps").
- **File-operand ops — the public API.** `deface(tmpl, mask, opts)` takes trailing argv opts (`['-cost','hel']`); `reface(tmpl, shell, weight)` takes three File operands; the mindgrab masking chain uses the public `.resliceNN(ref)` / `.mulImage(img)` chain methods (`niimath.image(x).gz(0).resliceNN(ref)`, `…mulImage(img)`). No private-API coupling remains, so the exact package pin can relax once nothing else needs it.
- **`dispose(reason)` is public.** Both `resetNiimathWorker()` and `cleanup()` call it; it terminates the worker and rejects the in-flight run. No casts to a private `worker` field anywhere.

## Deploy

Push to `main` builds + deploys to `gh-pages` (`.github/workflows/ghpages.yml`), served at `https://<org>.github.io/deface/`. The `/deface/` subpath is baked in via `base: '/deface/'` in [vite.config.ts](vite.config.ts) — reference bundled assets through `import.meta.env.BASE_URL`, not absolute `/`. `@niivue/dcm2niix` is in `optimizeDeps.exclude` because Vite's prebundler breaks its dynamic-import WASM worker; don't remove that.

## Open issues & deliberate non-fixes

- **Device refusal is the package's call, not this app's.** @brainchop/mindgrab refuses WebGPU without `shader-f16` or a 512 MiB buffer, WebGL2 when its probe allocation fails, and CPU on a page that is not cross-origin isolated. This app only decides what to SAY about it (`#webgpuDialog`). A device that is refused wrongly is a bug to fix upstream, in brainchop-c's `js/src/device.ts`.
- **Smoke scope (deliberately wiring-only).** The smoke drives the default `allineate` deface to completion, Save→download (privacy gating), the image picker's presence/default, one `reface` run, and ONE mindgrab outcome (a run, the dialog, or a named refusal), plus one Hellinger run under `SMOKE_FULL` — and fails on any `console.error`/page error. It does **not** assert anything about the output voxels: the four allineate variants, the rescalp/robustfov reface variants, and the mindgrab border/robustfov variants are just argv-flag/operand combinations of shared paths, and *registration/mask quality is niimath's to validate in its own regression data*, not this browser example's. (An earlier `__defaceStats` in-page probe was removed as production-code-serving-the-harness that only coarsely sanity-checked, per audit.)
- **Remaining smoke gaps** — (1) the **native-resolution** invariant: verified manually on a 0.75 mm scan (→ 0.75 mm, robustfov cropped 320→227). The default `t1_crop` is now itself non-isotropic-grid/non-1 mm (188×256×190, 0.88 mm), so every smoke run *feeds* a non-1 mm input — but nothing **asserts** the output dims/pixdim, so the invariant is still unverified in CI (needs a load hook). Same for reface's "output keeps the input's full extent even with `-robustfov`". (2) The **input/output name collision** (a source named `defaced.nii.gz`): safe by construction (the wrapper's `run()` prefixes `__nimi_*`) but **not exercised**; synthetically testable in principle (stage a `File` named `defaced.nii.gz` and assert the staged input name ≠ any output name) — a reasonable follow-up, and the check to re-run on any dep bump. (3) The **no-backend dialog** branch is not reached in CI: this GPU has WebGPU with `shader-f16`, so mindgrab runs on it — measured, the smoke prints the backend it used. Reaching that branch needs a browser with neither WebGPU nor WebGL2.
- **Declined refactor** (raised repeatedly, deliberately kept): `hasDefaced` stays a boolean rather than a displayed-volume state machine. For a single-controller no-framework app an FSM would add lines without deleting any, and the boolean is *easier* to audit for the privacy P0 (grep-able assignment sites vs. an FSM's edges). The mindgrab globals it also named are gone: the package owns that state now.
