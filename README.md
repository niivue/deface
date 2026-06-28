# deface

Remove facial features from a brain MRI for anonymization, **entirely in your browser** — no upload, no server. Drag in a NIfTI image (or a folder of DICOM files), pick a method, click Apply, and save the defaced result.

Live demo: deploys as a GitHub Project Page at `https://<org>.github.io/deface/`.

## How it works

All processing runs in WebAssembly + WebGPU on your machine so your images are not shared with the cloud:

- **[niimath](https://github.com/rordenlab/niimath)** does the registration-based defacing. It fits a bundled MNI template to your scan and zeros the voxels over the face, via either:
  - **spm_deface** — SPM rigid-body coregistration ([spm_coreg](https://www.fil.ion.ucl.ac.uk/spm/), J. Ashburner / Wellcome Centre)
  - **deface** — affine registration ([3dAllineate](https://afni.nimh.nih.gov/), RW Cox / AFNI)
- **[brainchop mindgrab](https://github.com/neuroneural/brainchop)** — an edge-based AI model for omnimodal brain extraction, run entirely on the GPU. It masks out everything but the brain, so it removes the face along with the skull and scalp. Variants combine two knobs — a tight skull-strip vs. an **8mm** tissue margin around the brain, and optional **robustfov** neck/inferior-slice cropping: **mindgrab**, **mindgrab robustfov**, **mindgrab 8mm border**, and **mindgrab robustfov + 8mm**. Requires **WebGPU with `shader-f16`** (recent desktop Chrome, Edge, or Safari).
- **[NiiVue](https://niivue.com/)** renders the image.
- **[dcm2niix](https://github.com/rordenlab/dcm2niix)** converts dropped DICOM folders to NIfTI.

The core operation is a single niimath chain, e.g.:

```
niimath input -robustfov -spm_deface MNI152_T1_2mm mniMask defaced.nii.gz
```

## License

**GPL-2.** The `spm_deface` path links the GPL `spm_coreg` module, so this app — and the niimath WASM it vendors in [`src/niimath-gpl/`](src/niimath-gpl/) — is a GPL-2 combined work. (The default `@niivue/niimath` npm package stays BSD; see that directory's README for how the GPL WASM is regenerated.)

## Develop

```bash
npm install      # or: bun install
npm run dev      # vite dev server (http://localhost:8091)
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build
```

Requires a browser with WebGPU (recent desktop Chrome, Edge, or Safari).
