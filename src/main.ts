/**
 * deface — remove facial features from a brain MRI for anonymization, entirely
 * in the browser. No data leaves the machine.
 *
 * Pipeline: load a NIfTI (or DICOM folder via dcm2niix, or a demo scan from the
 * Image picker) → anonymize → show + save the result. Three families of method:
 *   - `-deface` (BSD, default): affine-register a bundled MNI template + face
 *     mask and ZERO the face. Fast engine by default; `-cost hel` is the slower
 *     exhaustive Hellinger fit.
 *   - `-reface` (T1 only): REPLACE the face/scalp with a synthetic surface
 *     back-projected from a template-space shell.
 *   - mindgrab: deep-learning brain extraction on the GPU (needs shader-f16).
 * All niimath I/O is uncompressed (`-gz 0`) for speed — NiiVue re-gzips on Save.
 */

import NiiVueGPU, {
  type ImageFromUrlOptions,
  MULTIPLANAR_TYPE,
  SHOW_RENDER,
  SLICE_TYPE,
} from '@niivue/niivue'
import { runDcm2niix, traverseDataTransferItems } from './dcm2niix/index'
import { Niimath } from '@niivue/niimath'

const T1_URL = `${import.meta.env.BASE_URL}t1_crop.nii.gz`
const MNI_URL = `${import.meta.env.BASE_URL}avg152T1.nii.gz`
const MASK_URL = `${import.meta.env.BASE_URL}avg152T1mask.nii.gz`
// -reface templates: a template to register to, a template-space shell that supplies the
// synthetic surface, and a registration weight. Two shells: 212 replaces the face, 211
// the whole scalp. ~10 MB total, so these are fetched lazily on the first reface Apply
// (see ensureRefaceFiles) rather than at startup.
const REFACE_TMPL_URL = `${import.meta.env.BASE_URL}MNI152_2009_SSW.nii.gz`
const REFACE_WEIGHT_URL = `${import.meta.env.BASE_URL}MNI152_2009_SSW_weight.nii.gz`
const REFACE_SHELL_URL = `${import.meta.env.BASE_URL}refacer_shell_sym212.nii.gz`
const RESCALP_SHELL_URL = `${import.meta.env.BASE_URL}refacer_shell_sym211.nii.gz`

// Images offered in the toolbar's "Image" picker, so anonymization can be evaluated on
// more than the bundled default. The first entry is the local bundled image; the rest
// stream from the niivue-demo-images repo (CORS-enabled via raw.githubusercontent), so
// they cost nothing until chosen. Several are full-head scans where defacing actually
// matters (the bundled default is already cropped).
type Preset = { value: string; label: string; url: string; name: string }
const DEMO_BASE = 'https://raw.githubusercontent.com/niivue/niivue-demo-images/main/'
function demo(path: string): Preset {
  const name = path.split('/').pop()!
  return { value: `demo:${path}`, label: name.replace(/\.nii(\.gz)?$/i, ''), url: DEMO_BASE + path, name }
}
const IMAGE_PRESETS: Preset[] = [
  { value: 't1_crop', label: 't1_crop (default)', url: T1_URL, name: 't1_crop.nii.gz' },
  ...[
    // (no chris_t1 — it is the same scan as the bundled t1_crop default)
    'chris_t2.nii.gz',
    'chris_PD.nii.gz',
    'CT_Philips.nii.gz',
    'register/T1_head.nii.gz',
    'register/T1_head_ext.nii.gz',
    'register/T2w.nii.gz',
    'register/FLAIR_2D.nii.gz',
    'register/T1_ds000031.nii.gz',
  ].map(demo),
]

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element #${id} not found`)
  return el as T
}

// --- DOM handles ---
const locationEl = $('location')
const loadingCircle = $('loadingCircle')
const statusMsg = $<HTMLLabelElement>('statusMsg')
const methodSelect = $<HTMLSelectElement>('methodSelect')
const applyBtn = $<HTMLButtonElement>('applyBtn')
const saveBtn = $<HTMLButtonElement>('saveBtn')
const aboutBtn = $<HTMLButtonElement>('aboutBtn')
const aboutDialog = $<HTMLDialogElement>('aboutDialog')
const dicomPick = $<HTMLSelectElement>('dicomPick')
const imageSelect = $<HTMLSelectElement>('imageSelect')
const webgpuDialog = $<HTMLDialogElement>('webgpuDialog')

// --- NiiVue setup ---
// The NiiVue constructor is GPU-free; attachTo() acquires the WebGPU device and
// throws on a browser without it. So construct here but defer attachTo to init(),
// AFTER the navigator.gpu guard, or a no-WebGPU browser gets an unhandled
// top-level rejection instead of the friendly "needs WebGPU" message.
const nv = new NiiVueGPU({ isDragDropEnabled: false, backgroundColor: [0, 0, 0, 1] })
type ExtCtx = ReturnType<typeof nv.createExtensionContext>
let ctx: ExtCtx | null = null

async function attachNiiVue(): Promise<void> {
  await nv.attachTo('gl1')
  nv.multiplanarType = MULTIPLANAR_TYPE.GRID
  nv.sliceType = SLICE_TYPE.MULTIPLANAR
  nv.showRender = SHOW_RENDER.ALWAYS
  nv.crosshairGap = 5
  nv.isLegendVisible = false
  ctx = nv.createExtensionContext()
  ctx.on('locationChange', (e) => {
    locationEl.textContent = e.detail.string
  })
}

// --- App state ---
let isCleanedUp = false
// The original loaded/dropped source image, fed to niimath. Apply always defaces
// THIS (not the previous defaced output), so repeated Apply clicks or switching
// methods re-run on the pristine source rather than degrading an already-cropped,
// already-defaced image.
let sourceFile: File | null = null
// Bundled MNI template + face mask, fetched once and reused for every run.
let refFiles: { mni: File; mask: File } | null = null
// -reface templates (template + weight + the two shells), fetched lazily on the first
// reface/rescalp Apply — ~10 MB that a user who only defaces should never download.
let refaceFiles: { tmpl: File; weight: File; face: File; scalp: File } | null = null
// True once the CURRENTLY displayed volume is a defaced result. Save is gated on
// this so a user can't download the un-defaced source under the name defaced.nii.gz
// (a privacy footgun for an anonymization tool). Reset when a new source loads.
let hasDefaced = false

const niimath = new Niimath()
let niimathReady: Promise<void> | null = null
niimath.setOutputDataType('input') // preserve source datatype on save (smaller output)

// --- mindgrab (deep-learning brain extraction) ---
// @brainchop/mindgrab owns the whole chain — conform, the MeshNet layers, the
// largest-connected-component cleanup, the mm border, and the reslice back onto
// the input grid — inside a wasm module, so this app holds no model, no device
// and no state for it. The module's own .js/.wasm are staged into
// public/brainchop/ by scripts/copy-brainchop.mjs and located through
// `assetPath`; the package's loader computes that URL at run time, which is
// exactly why Vite cannot emit them for us.
const BRAINCHOP_ASSETS = `${import.meta.env.BASE_URL}brainchop/`

// Skull-strip `src` and return it with everything outside the brain floored.
//
// Runs in the package's own Worker (`worker: true`): the WebGL2 fallback module
// is synchronous, so on the main thread it would freeze the page for seconds,
// and terminate() is also the only real cancellation. It picks WebGPU, then
// WebGL2, then the threaded CPU module, and refuses rather than downgrading
// silently — `result.backend` says which one ran.
async function brainExtract(src: File, borderMm: number): Promise<{ file: File; backend: string }> {
  setStatus('Brain extraction (mindgrab)…')
  // Fail closed: the displayed volume is about to be replaced, so drop Save
  // eligibility first. Re-enabled only when the result loads (asSource=false).
  hasDefaced = false
  updateButtons()
  const { segment } = await import('@brainchop/mindgrab')
  const { image, backend } = await segment(await src.arrayBuffer(), {
    model: 'mindgrab',
    // Grow the brain mask by N mm before it is applied, instead of a tight
    // strip. The face, far from the brain, goes either way.
    ...(borderMm > 0 ? { borderMm } : {}),
    worker: true,
    assetPath: BRAINCHOP_ASSETS,
  })
  return { file: new File([image], 'defaced.nii'), backend }
}

const listeners = new AbortController()
const ac = { signal: listeners.signal }

// --- Status helpers ---
function setStatus(msg: string): void {
  statusMsg.textContent = msg
  // The footer cell ellipsizes; expose the full text (esp. long failures) on hover.
  statusMsg.title = msg
  statusMsg.classList.toggle('hidden', msg === '')
}
function spin(on: boolean): void {
  // Toggle visibility (not display) so the spinner's box stays reserved and the
  // status bar height never changes — see .loading-circle in style.css.
  loadingCircle.style.visibility = on ? 'visible' : 'hidden'
}

// --- Button gating ---
function updateButtons(): void {
  const busy = isBusy()
  applyBtn.disabled = busy || !sourceFile || !refFiles
  methodSelect.disabled = busy
  imageSelect.disabled = busy // swapping the source mid-run would race the queue
  saveBtn.disabled = busy || !hasDefaced
  aboutBtn.disabled = false
}

// --- Serial task queue (load / drop / deface must not overlap) ---
let pending: Promise<unknown> = Promise.resolve()
let inFlightCount = 0
function isBusy(): boolean {
  return inFlightCount > 0
}
function enqueue(fn: () => Promise<unknown>): void {
  if (isCleanedUp) return
  inFlightCount++
  updateButtons()
  pending = pending
    .then(fn)
    .catch((err: unknown) => {
      if (isCleanedUp) return
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(`Failed: ${msg}`)
      console.error('deface task failed', err)
    })
    .finally(() => {
      inFlightCount--
      updateButtons()
    })
}

async function ensureNiimath(): Promise<void> {
  if (!niimathReady) niimathReady = niimath.init().then(() => undefined)
  await niimathReady
}

// After a failed/aborted niimath run (incl. OOM, which the WASM allocators bail on
// via longjmp), the worker's WASM heap and Emscripten MEMFS may be in an undefined
// state. Dispose the worker and clear niimathReady so the next run spins up a
// fresh one rather than reusing leaked/stale state.
function resetNiimathWorker(): void {
  try {
    niimath.dispose('niimath worker reset after a failed run')
  } catch {
    // worker may already be gone
  }
  niimathReady = null
}

async function fetchFile(url: string, name: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${name} failed: ${res.status}`)
  return new File([await res.blob()], name)
}

// --- Image picker (toolbar) ---
// Which preset the DISPLAYED source came from, so a failed fetch can restore the picker
// label instead of leaving it pointing at an image that never loaded.
const CUSTOM_VALUE = '__custom'
let imageSelection = IMAGE_PRESETS[0].value

function populateImageSelect(): void {
  imageSelect.replaceChildren()
  for (const p of IMAGE_PRESETS) {
    const opt = document.createElement('option')
    opt.value = p.value
    opt.text = p.label
    imageSelect.appendChild(opt)
  }
  // Hidden entry, revealed only once a user drops/converts their own file, so the picker
  // never claims a preset is displayed when it isn't.
  const custom = document.createElement('option')
  custom.value = CUSTOM_VALUE
  custom.hidden = true
  imageSelect.appendChild(custom)
  imageSelect.value = imageSelection
}

// Point the picker at the "(dropped)" entry when a user-supplied file becomes the source.
function markCustomImage(name: string): void {
  const custom = imageSelect.querySelector<HTMLOptionElement>(`option[value="${CUSTOM_VALUE}"]`)
  if (custom) custom.text = `(dropped) ${name}`
  imageSelect.value = CUSTOM_VALUE
  imageSelection = CUSTOM_VALUE
}

// Load the chosen preset as the new pristine source. loadFromFile(…, true) clears
// hasDefaced before displaying, so switching images can never leave Save enabled over an
// un-defaced scan (privacy, fail-closed).
async function onImagePresetChange(): Promise<void> {
  const preset = IMAGE_PRESETS.find((p) => p.value === imageSelect.value)
  if (!preset) return // the hidden "(dropped)" entry — nothing to fetch
  spin(true)
  try {
    setStatus(`Loading ${preset.label}…`)
    let file: File
    try {
      file = await fetchFile(preset.url, preset.name)
      await loadFromFile(file)
    } catch (err) {
      // Fetching or parsing a remote demo can fail; restore the picker to the last source
      // that loaded successfully.
      imageSelect.value = imageSelection
      throw err
    }
    imageSelection = preset.value
    dcmConverted = []
    dicomPick.classList.add('hidden')
    setStatus(`Loaded ${preset.label} — choose a method and click Apply.`)
  } finally {
    spin(false)
  }
}

// Fetch the -reface templates on first use and cache them. Kept out of init() so the
// ~10 MB only downloads for users who actually reface/rescalp. Both shells are fetched
// together so switching between reface and rescalp costs nothing.
async function ensureRefaceFiles(): Promise<typeof refaceFiles> {
  if (!refaceFiles) {
    const [tmpl, weight, face, scalp] = await Promise.all([
      fetchFile(REFACE_TMPL_URL, 'MNI152_2009_SSW.nii.gz'),
      fetchFile(REFACE_WEIGHT_URL, 'MNI152_2009_SSW_weight.nii.gz'),
      fetchFile(REFACE_SHELL_URL, 'refacer_shell_sym212.nii.gz'),
      fetchFile(RESCALP_SHELL_URL, 'refacer_shell_sym211.nii.gz'),
    ])
    refaceFiles = { tmpl, weight, face, scalp }
  }
  return refaceFiles
}

// --- Load ---
// asSource=true for user-supplied images (default/drop/dcm2niix pick) — these
// become the pristine input that Apply defaces. The defaced result is displayed
// with asSource=false so it never replaces the source.
async function loadFromFile(file: File, asSource = true): Promise<void> {
  if (isCleanedUp) return
  // Fail closed: a source (asSource=true) is un-defaced, so clear Save eligibility
  // BEFORE the awaitable display — a load rejection after a prior deface must not
  // leave Save enabled over the un-defaced image (same pattern as makeBrainMask).
  if (asSource) {
    hasDefaced = false
    updateButtons()
  }
  try {
    await nv.loadVolumes([{ url: file, name: file.name } as ImageFromUrlOptions])
  } catch (err) {
    // A failed source load can leave the canvas blank/partial. Drop sourceFile so Apply
    // can't target a stale source that no longer matches the display (display/sourceFile
    // divergence). Rethrow so enqueue() still reports the failure.
    if (asSource) {
      sourceFile = null
      updateButtons()
    }
    throw err
  }
  if (isCleanedUp) return
  if (asSource) sourceFile = file
  // A freshly loaded source is NOT yet defaced; a deface result (asSource=false) is.
  hasDefaced = !asSource
  updateButtons()
}

// --- Deface ---
async function runDeface(): Promise<void> {
  if (!sourceFile || !refFiles) return
  const method = methodSelect.value // allineate[_hel][_robustfov] | reface|rescalp[_robustfov] | mindgrab[_robust][8]

  // reface/rescalp REPLACE the surface with a synthetic one instead of zeroing it:
  // `-reface <tmpl> <shell> <weight>` registers the subject to the template, back-projects
  // the template-space shell, and composites it in. The shell chooses what is replaced —
  // sym212 = face, sym211 = whole scalp. Unlike `-deface`, reface writes onto the ORIGINAL
  // subject grid, so `-robustfov` only tightens the registration; output dims are unchanged.
  if (method.startsWith('reface') || method.startsWith('rescalp')) {
    const useScalp = method.startsWith('rescalp')
    const useRobustfov = method.includes('robustfov')
    const label = `${useScalp ? 'rescalp' : 'reface'}${useRobustfov ? ' (robustfov)' : ''}`
    spin(true)
    setStatus(`Loading ${label} templates…`)
    const t0 = performance.now()
    try {
      const rf = await ensureRefaceFiles()
      if (isCleanedUp || !rf) return
      await ensureNiimath()
      if (isCleanedUp) return
      setStatus(`Refacing with ${label}…`)
      // Always run on the pristine sourceFile so repeated Apply doesn't re-reface an
      // already-refaced output. gz(0): uncompressed .nii I/O (NiiVue re-gzips on Save).
      const base = niimath.image(sourceFile).gz(0)
      const chain = useRobustfov ? base.robustfov() : base
      const blob = await chain
        .reface(rf.tmpl, useScalp ? rf.scalp : rf.face, rf.weight)
        .run('refaced.nii')
      if (isCleanedUp) return
      await loadFromFile(new File([blob], 'refaced.nii'), false) // display; source stays pristine
      setStatus(`Refaced with ${label} (${Math.round(performance.now() - t0)} ms)`)
    } catch (err) {
      // A failed/OOM run can leave the worker's WASM heap + MEMFS corrupt; recreate it
      // before the next Apply. Rethrow so enqueue() still reports "Failed: …".
      resetNiimathWorker()
      throw err
    } finally {
      spin(false)
      updateButtons()
    }
    return
  }

  // mindgrab needs a GPU or a cross-origin isolated page; if neither, explain
  // rather than fail.
  if (method.startsWith('mindgrab')) {
    // Two independent knobs encoded in the method name:
    // - `8` suffix: keep an 8 mm shell of tissue around the brain instead of a
    //   tight skull-strip; the face, far from the brain, is still removed.
    // - `robust`: crop with `-robustfov` FIRST and skull-strip that copy, so the
    //   output keeps the crop. Everything downstream works on that one image, so
    //   no two coordinate spaces are ever mixed.
    const borderMm = method.endsWith('8') ? 8 : 0
    const useRobustfov = method.includes('robust')
    spin(true)
    // Fetching and instantiating the wasm module is the heaviest setup; show busy
    // feedback before it (the UI is already disabled by enqueue()).
    setStatus('Loading mindgrab model…')
    const t0 = performance.now()
    try {
      // Captured, because runDeface's `sourceFile` null check does not survive an
      // await — it is module-level mutable state.
      let src: File = sourceFile
      if (useRobustfov) {
        await ensureNiimath()
        if (isCleanedUp) return
        // gz(0): niimath reads/writes uncompressed .nii (no per-run gzip/gunzip)
        // — faster round trips. The blob stays in memory (NiiVue re-gzips on Save).
        src = new File(
          [await niimath.image(sourceFile).gz(0).robustfov().run('robustfov.nii')],
          'robustfov.nii',
        )
        if (isCleanedUp) return
      }
      // No reslice and no mask multiply here any more: the module conforms
      // internally, grows the border on the conformed grid and reslices the
      // result back onto THIS image's own grid, so the output is already at the
      // input resolution. It floors non-brain voxels to the image minimum rather
      // than to zero — identical for any volume whose minimum is 0, and measured
      // as a strict subset of the old mask-multiply on the bundled subject
      // (18,391 of 19.2M voxels removed that the old path kept, none the other
      // way), which is the safe direction for a defacer.
      const { file, backend } = await brainExtract(src, borderMm)
      if (isCleanedUp) return
      await loadFromFile(file, false)
      const tag = `${useRobustfov ? 'robustfov + ' : ''}${borderMm > 0 ? `${borderMm} mm border` : 'tight'}`
      setStatus(
        `Brain-extracted with mindgrab (${tag}, ${backend}) ` +
        `(${Math.round(performance.now() - t0)} ms)`,
      )
    } catch (err) {
      // A refusal is not a failure: every backend declined, and the message names
      // all three reasons. `no-webgpu` is the package's code for that, cross-origin
      // isolation included. Checked structurally so the package stays lazily
      // imported — a value import of BrainchopError would pull it into the entry
      // bundle.
      if ((err as { code?: string })?.code === 'no-webgpu') {
        webgpuDialog.showModal()
        setStatus('mindgrab found no usable GPU here — try an allineate method.')
        return
      }
      // A failed run can corrupt the niimath heap; recreate it before the next
      // Apply. The wasm module needs no reset — it is created and terminated per
      // call inside the package's worker. Rethrow so enqueue() reports "Failed: …".
      resetNiimathWorker()
      throw err
    } finally {
      spin(false)
      updateButtons()
    }
    return
  }

  // Two orthogonal knobs in the method slug: `_robustfov` crops (neck/inferior) first,
  // `_hel` picks the exhaustive Hellinger engine (`-cost hel`) over the fast default.
  // Anchor `_hel` (not `hel`) so a slug like `allineate_shell` can't misroute.
  const useRobustfov = method.includes('robustfov')
  const useHel = method.includes('_hel')
  const label = `allineate (${useHel ? 'Hellinger' : 'fast'}${useRobustfov ? ', robustfov' : ''})`
  spin(true)
  // Hellinger is single-threaded in WASM (no OpenMP) and runs an exhaustive search, so it
  // is minutes on a full-head scan; set the expectation so a slow run doesn't look hung.
  setStatus(
    `Defacing with ${label}… (${useHel ? 'Hellinger, single-threaded — up to a few minutes' : 'fast ~5 s'})`,
  )
  const t0 = performance.now()
  try {
    await ensureNiimath()
    if (isCleanedUp) return
    // Register the bundled MNI template to the subject and zero the face voxels.
    // Always run on the pristine sourceFile so repeated Apply doesn't re-deface an
    // already-cropped/defaced output. gz(0): uncompressed .nii I/O for speed (NiiVue
    // re-gzips only on Save). `-cost hel` picks the exhaustive engine; omitting -cost
    // uses the fast default (with Hellinger fallback on degenerate inputs).
    const base = niimath.image(sourceFile).gz(0)
    const chain = useRobustfov ? base.robustfov() : base
    const opts = useHel ? ['-cost', 'hel'] : []
    const defaced = chain.deface(refFiles.mni, refFiles.mask, opts)
    const blob = await defaced.run('defaced.nii')
    if (isCleanedUp) return
    const out = new File([blob], 'defaced.nii')
    await loadFromFile(out, false) // display result; keep sourceFile pristine
    const ms = Math.round(performance.now() - t0)
    setStatus(`Defaced with ${label} (${ms} ms)`)
  } catch (err) {
    // A failed/OOM run can leave the worker's WASM heap + MEMFS corrupt; recreate
    // it before the next Apply so a retry starts clean. Rethrow so enqueue() still
    // reports "Failed: …".
    resetNiimathWorker()
    throw err
  } finally {
    spin(false)
    updateButtons()
  }
}

// --- Save ---
async function runSave(): Promise<void> {
  // Runtime guard, not just the disabled button: never serialize the un-defaced
  // source (privacy), and don't race an in-flight run. Surface failures via status
  // rather than dropping the promise at the listener (() => void runSave()).
  if (!hasDefaced || isBusy() || nv.volumes.length === 0) return
  try {
    await nv.saveVolume({ filename: 'defaced.nii.gz', volumeByIndex: 0 })
  } catch (err) {
    setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// --- DICOM / file drag-drop ---
let dcmConverted: File[] = []
const DIRECT_VOLUME_RE = /\.(nii|nii\.gz|mgh|mgz|nrrd|mha|mhd|nhdr|head|v)$/i

async function handleDrop(filesPromise: Promise<File[]>): Promise<void> {
  if (isCleanedUp) return
  spin(true)
  try {
    setStatus('Reading dropped files…')
    const files = await filesPromise
    if (files.length === 0) {
      setStatus('Drop contained no readable files.')
      return
    }
    // Fast-path a single obvious volume file straight to NiiVue.
    if (files.length === 1 && DIRECT_VOLUME_RE.test(files[0].name)) {
      dcmConverted = []
      dicomPick.classList.add('hidden')
      setStatus(`Loading ${files[0].name}…`)
      await loadFromFile(files[0])
      markCustomImage(files[0].name)
      return
    }
    setStatus(`Converting ${files.length} file(s) with dcm2niix…`)
    const t0 = performance.now()
    const niftiFiles = await runDcm2niix(files)
    const ms = Math.round(performance.now() - t0)
    if (niftiFiles.length === 0) {
      setStatus('No NIfTI output produced. Are these DICOM images?')
      return
    }
    if (niftiFiles.length > 1) {
      dcmConverted = niftiFiles
      dicomPick.replaceChildren()
      niftiFiles.forEach((f, i) => {
        const opt = document.createElement('option')
        opt.value = String(i)
        opt.text = f.name
        dicomPick.appendChild(opt)
      })
      dicomPick.value = '0'
      dicomPick.classList.remove('hidden')
      setStatus(`dcm2niix: ${niftiFiles.length} NIfTI in ${ms} ms — pick one.`)
    } else {
      dcmConverted = []
      dicomPick.classList.add('hidden')
      setStatus(`dcm2niix: 1 NIfTI in ${ms} ms — loading…`)
    }
    await loadFromFile(niftiFiles[0])
    markCustomImage(niftiFiles[0].name)
  } finally {
    spin(false)
  }
}

// --- Init ---
async function init(): Promise<void> {
  // NiiVue's attachTo() acquires a WebGPU device and throws without one. But
  // navigator.gpu can exist while requestAdapter() returns null, device creation
  // fails, or the GPU is blocklisted — so guard the fast case AND catch attachTo()
  // failures, giving a friendly message instead of an unhandled console.error in
  // every WebGPU-unavailable path. (mindgrab's stricter shader-f16 requirement is a
  // separate gate via #webgpuDialog.)
  const noWebGpu =
    'This browser/GPU can’t initialize WebGPU — deface needs a recent desktop Chrome, Edge, or Safari.'
  if (!navigator.gpu) {
    setStatus(noWebGpu)
    return
  }
  try {
    await attachNiiVue()
  } catch (err) {
    // Almost always genuine WebGPU unavailability; warn (not error, so the smoke's
    // console.error gate stays meaningful) so a non-WebGPU init bug isn't silently
    // mislabeled. Either way return fail-closed: sourceFile/refFiles stay unset.
    console.warn('deface: WebGPU init failed', err)
    setStatus(noWebGpu)
    return
  }
  setStatus('Loading default image + MNI template…')
  // Fetch the bundled template/mask once; load the default subject.
  const [mni, mask] = await Promise.all([
    fetchFile(MNI_URL, 'MNI152_T1_2mm.nii.gz'),
    fetchFile(MASK_URL, 'mniMask.nii.gz'),
  ])
  refFiles = { mni, mask }
  const t1 = await fetchFile(T1_URL, 't1_crop.nii.gz')
  await loadFromFile(t1)
  setStatus('Ready — choose a method and click Apply.')
}

// --- Wiring ---
document.addEventListener('dragover', (e) => e.preventDefault(), ac)
document.addEventListener(
  'drop',
  (e) => {
    e.preventDefault()
    const items = e.dataTransfer?.items
    if (!items || items.length === 0) return
    // A DataTransferItemList is only valid during this event; start traversal now.
    const filesPromise = traverseDataTransferItems(items)
    filesPromise.catch(() => {})
    enqueue(() => handleDrop(filesPromise))
  },
  ac,
)
dicomPick.addEventListener(
  'change',
  () => {
    const file = dcmConverted[Number(dicomPick.value)]
    if (file) {
      enqueue(async () => {
        await loadFromFile(file)
        markCustomImage(file.name)
      })
    }
  },
  ac,
)
// Serialized through the same queue as loads/defaces (single-flight), so switching the
// image can't overlap an in-flight niimath run.
imageSelect.addEventListener('change', () => enqueue(onImagePresetChange), ac)
applyBtn.addEventListener('click', () => enqueue(runDeface), ac)
saveBtn.addEventListener('click', () => void runSave(), ac)
aboutBtn.addEventListener('click', () => aboutDialog.showModal(), ac)

// --- Cleanup (HMR / tab close) ---
async function cleanup(): Promise<void> {
  if (isCleanedUp) return
  isCleanedUp = true
  listeners.abort()
  // Dispose the niimath worker FIRST (don't await `pending`): an in-flight run is one
  // uninterruptible WASM call — a Hellinger fit would stall teardown for minutes. The
  // wrapper rejects the interrupted run; enqueue suppresses that expected teardown failure.
  try {
    niimath.dispose('niimath worker disposed during cleanup')
  } catch {
    // worker may already be gone
  }
  // Nothing to release for mindgrab: @brainchop/mindgrab creates its Worker per
  // call and terminates it in a finally, which takes the module's heap, its GPU
  // device and any thread pool with it. An in-flight run outlives this teardown
  // by at most one segmentation and holds nothing afterwards.
  try {
    ctx?.dispose() // null if WebGPU was unavailable (attachNiiVue never ran)
  } catch {
    // best-effort — must not skip nv.destroy() below
  }
  nv.destroy()
}
window.addEventListener('pagehide', (e) => {
  if (e.persisted) return
  void cleanup()
}, { once: true, signal: listeners.signal })
if (import.meta.hot) import.meta.hot.dispose(cleanup)

populateImageSelect()
updateButtons()
enqueue(init)
