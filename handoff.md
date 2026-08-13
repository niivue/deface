# handoff — verify deface + MindGrab on a WebGL2-only browser (Linux)

**What you have that this machine does not:** a browser where **neither the page
nor its Web Workers** have WebGPU. Linux Firefox and Chrome are exactly that
today. Everything below is a question that only such a browser can answer.

**Site:** https://niivue.github.io/deface/ (commit `d9d2164` or later — check the
About dialog names `@brainchop/mindgrab`).

---

## What was wrong, and what is already fixed

You reported: the site showed *"This browser/GPU can't initialize WebGPU"* on
Linux Firefox and Chrome, and nothing worked.

That message was **deface's own guard**, not MindGrab's, and it fired in `init()`
before MindGrab was ever reached:

```ts
if (!navigator.gpu) { setStatus(noWebGpu); return }    // deleted in d9d2164
```

NiiVue never needed it. `NVControlBase` downgrades itself — its own log line is
`WebGPU not available, falling back to WebGL2`. Our guard refused first, so the
app declared a capable browser incapable, and the WebGL2 segmentation fallback
was unreachable on precisely the machines it exists for.

**Fixed and deployed.** `attachTo()` is still wrapped in a try, because failing
to get *either* backend is a genuine refusal.

## What is verified, and on what

| claim | verified how | where |
|---|---|---|
| NiiVue renders without WebGPU | Chromium with `navigator.gpu` hidden before any script runs; NiiVue logged the fallback and the ANGLE Metal renderer; Apply enabled; status read "Ready" | macOS/M4 Pro |
| The package picks WebGL2 by its own probe and segments | driven directly on that page: `backend: 'webgl2'`, **3,837 ms** | macOS/M4 Pro |
| MindGrab on WebGL2 **inside a Worker** | package test suite, but with WebGPU present on the machine | macOS/M4 Pro |
| MindGrab on WebGL2 on a **non-Apple GPU** | **never** | — |

The gap is the last two rows. `page.addInitScript` does not apply to Web
Workers, so on this machine the page could be made WebGPU-less while the worker
kept it — and deface calls `segment(..., { worker: true })`. A real WebGL2-only
browser is the only way to exercise the worker path honestly.

---

## What to run

### 1. The live site (2 minutes, the important one)

1. Open https://niivue.github.io/deface/ in Linux Firefox, then Chrome.
2. It should load an image and enable **Apply**. If you still see any
   "can't initialize" message, **stop and report it** — the fix failed.
3. Method → `mindgrab` → **Apply**.
4. Read the status line at the bottom. It names the backend:
   `Brain-extracted with mindgrab (tight, webgl2) (4112 ms)`

**Report:** that whole status string, plus browser version, distro, and GPU
(`chrome://gpu` → "GL Renderer", or `about:support` → "Graphics" in Firefox).
The number matters as much as the success — it is the first WebGL2 timing from
any non-Apple GPU.

Then repeat with `mindgrab 8mm border` and `mindgrab robustfov + 8mm`.

### 2. If something fails

The three outcomes are different bugs, so please distinguish them:

- **A dialog appears** ("MindGrab can't run here") → the package refused. Open
  the console; the message names all three backends' reasons. Send it verbatim.
- **Status reads `Failed: …`** → it tried and broke. Console + status text.
- **It hangs** with the spinner on and no status change → the worst case, and
  the most useful to catch. Note how long you waited. The WebGL2 module is
  synchronous, so it cannot self-timeout inside its worker; the outer bound is
  15 minutes.

Console output is essential in all three cases — the package logs the module's
own stderr through `onLog`.

### 3. Voxel-accuracy check (optional, ~10 minutes, high value)

The live site proves it *runs*. It does not check the answer. The fp16 voxel
budgets live in the package's own suite, and they have only ever been validated
against Apple's GPU:

```sh
git clone https://github.com/neuroneural/brainchopC && cd brainchopC/js
npm install
# needs a checkout with playwright installed:
BC_PLAYWRIGHT_ROOT=/path/to/a/checkout/with/playwright \
BC_TEST_BACKENDS=webgl2 npm test
```

It prints differing-voxel counts against the C reference. **Budgets: 64 for
MindGrab, 1024 for the 18-class model, 256 for the native-2 mm case.** On this
machine WebGL2 reads 33 / 710 / 94. Anything over budget on your GPU is a real
finding — the fp16 tolerances were derived on one vendor's stack and this is the
first independent check.

The suite runs **headed** (`headless: false`) — you need a display, not SSH.

---

## Things that will look like bugs and are not

- **The CPU backend is unavailable on the live site, by design.** It is a
  pthreads wasm module, so it needs `Cross-Origin-Opener-Policy: same-origin`
  and `Cross-Origin-Embedder-Policy: require-corp`, and GitHub Pages cannot send
  response headers. `checkCpuSupport()` refuses before fetching it — the reason
  string is "this page is not cross-origin isolated". Locally, `npm run dev`
  *does* send those headers, so the CPU path is testable there and only there.
- **The status line saying `webgl2` is the success case**, not a degradation
  notice. WebGPU is preferred only because it is ~2× faster.
- **`mindgrab` output differs slightly from the old build.** Non-brain voxels are
  floored to the image minimum rather than zero, and the mm border is grown on
  the conformed grid rather than the native one. Measured on the bundled
  subject at 8 mm: the new output is a strict subset of the old — 18,391 of
  19.2M voxels removed that the old path kept, none the other way.

## Running it locally on the Linux box

```sh
git clone https://github.com/niivue/deface && cd deface
npm ci
npm run dev        # http://localhost:8091/deface/ — COOP/COEP set, so cpu works too
npm run build && npm run preview   # no COOP/COEP: what GitHub Pages actually serves
```

`npm run dev` and `npm run build` both run `scripts/copy-brainchop.mjs` first,
which stages seven files from `node_modules/@brainchop/mindgrab/dist` into
`public/brainchop/`. If those 404, that script did not run.

To force a backend and skip the probe, from the page console:

```js
const { segment } = await import('/deface/brainchop/index.js')   // dev/preview only
const buf = await (await fetch('/deface/t1_crop.nii.gz')).arrayBuffer()
const r = await segment(buf, { model: 'mindgrab', backend: 'webgl2',
                               assetPath: '/deface/brainchop/' })
console.log(r.backend, r.elapsedMs)
```

`index.js` is **not** deployed to the live site (the app bundles it), so that
snippet needs `cp node_modules/@brainchop/mindgrab/dist/index.js public/brainchop/`
first. Naming a backend makes an unsupported choice an **error** rather than a
silent downgrade, which is what makes it a useful probe.

## Repo state

- deface `main` at `d9d2164`, deployed. Depends on `@brainchop/mindgrab@^0.1.20260813`.
- The package is published, public, MIT: https://www.npmjs.com/package/@brainchop/mindgrab
- brainchopC `threaded-wasm` has 5 unpushed commits (the rename, the license fix,
  the niimath attribution, and a 64-bit conversion fix).
