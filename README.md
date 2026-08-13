# deface

Remove facial features from a brain MRI for anonymization, **entirely in your browser** — no upload, no server. Drag in a NIfTI image (or a folder of DICOM files), pick a method, click Apply, and save the defaced result.

Live demo: deploys as a GitHub Project Page at `https://<org>.github.io/deface/`.

The **Image** picker at the left of the toolbar swaps in other scans (T1, T2, PD, FLAIR, CT) so you can judge how each method behaves before running it on your own data. It starts on a bundled cropped T1; the rest stream on demand from the `niivue-demo-images` repository.

## How it works

All processing runs in WebAssembly + WebGPU on your machine so your images are not shared with the cloud:

- **[niimath](https://github.com/rordenlab/niimath)** does the registration-based defacing. It fits a bundled MNI template ([3dAllineate](https://afni.nimh.nih.gov/)-style affine registration, RW Cox / AFNI) to your scan and zeros the voxels over the face. Four variants combine two knobs — the registration engine and an optional **robustfov** crop of the neck/inferior slices for a tighter face mask:
  - **allineate (fast)** — the fast registration engine (Hellinger mutual information with a robust fallback), the default, ~5 s
  - **allineate (fast, robustfov)** — the fast engine after a `-robustfov` crop
  - **allineate (Hellinger)** — the exhaustive Hellinger engine (`-cost hel`): a reference-quality fit, but single-threaded in WebAssembly it can take a few minutes on a full-head scan (native niimath is ~6× faster via OpenMP threads that WASM lacks)
  - **allineate (Hellinger, robustfov)** — the Hellinger engine after a `-robustfov` crop
- **niimath `-reface`** — instead of *zeroing* the surface, it composites a **synthetic** one
  (AFNI `afni_refacer2`-style): the subject is registered to a template and a template-space
  shell is back-projected onto the original grid, so the head still looks like a head.
  The shell picks what is replaced — **reface** swaps the face, **rescalp** swaps the whole
  scalp — each also offered with a **robustfov** crop (which only tightens the registration;
  the output keeps the input's full extent). Templates load on first use (~10 MB).
  **T1-weighted images only:** the shell supplies T1-like intensities, so compositing it onto
  a T2/FLAIR/PD/CT scan produces a surface that doesn't match the host image — use an
  **allineate** or **mindgrab** method for those.
- **[brainchop mindgrab](https://github.com/neuroneural/brainchop)** — an edge-based AI model for omnimodal brain extraction, run entirely in the browser via **[@brainchop/mindgrab](https://www.npmjs.com/package/@brainchop/mindgrab)**. It masks out everything but the brain, so it removes the face along with the skull and scalp. Variants combine two knobs — a tight skull-strip vs. an **8mm** tissue margin around the brain, and optional **robustfov** neck/inferior-slice cropping: **mindgrab**, **mindgrab robustfov**, **mindgrab 8mm border**, and **mindgrab robustfov + 8mm**. Runs on **WebGPU** where available and falls back to **WebGL2**, so it needs no particular GPU feature — only a browser with one of the two.
- **[NiiVue](https://niivue.com/)** renders the image.
- **[dcm2niix](https://github.com/rordenlab/dcm2niix)** converts dropped DICOM folders to NIfTI.

The core operation is a single niimath chain, e.g.:

```
niimath input -gz 0 -robustfov -deface avg152T1 avg152T1mask defaced.nii
```

All niimath I/O is uncompressed (`-gz 0`) for speed; NiiVue re-gzips when you Save.

## License

**BSD-2-Clause.** Defacing uses the BSD-2 build of niimath (`@niivue/niimath`, added via `package.json`) — the fast affine `-deface` engine, no GPL `spm_coreg`/SPM code — so the whole app is BSD-2-Clause.

## Develop

```bash
npm install      # or: bun install
npm run dev      # vite dev server (http://localhost:8091)
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build
```

Requires a browser with WebGPU (recent desktop Chrome, Edge, or Safari).
