/**
 * deface — remove facial features from a brain MRI for anonymization, entirely
 * in the browser. No data leaves the machine.
 *
 * Pipeline: load a NIfTI (or DICOM folder via dcm2niix) → run niimath
 * `-robustfov -spm_deface` (SPM rigid, GPL) or `-robustfov -deface` (AFNI
 * affine, BSD) with a bundled MNI template + face mask → show + save the result.
 */

import NiiVueGPU, {
  type ImageFromUrlOptions,
  MULTIPLANAR_TYPE,
  SHOW_RENDER,
  SLICE_TYPE,
} from '@niivue/niivue'
import { runDcm2niix, traverseDataTransferItems } from './dcm2niix/index'
import { Niimath } from './niimath-gpl/index'

const T1_URL = `${import.meta.env.BASE_URL}t1_crop.nii.gz`
const MNI_URL = `${import.meta.env.BASE_URL}avg152T1.nii.gz`
const MASK_URL = `${import.meta.env.BASE_URL}avg152T1mask.nii.gz`

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element #${id} not found`)
  return el as T
}

// --- DOM handles ---
const locationEl = $('location')
const memstatus = $('memstatus')
const loadingCircle = $('loadingCircle')
const statusMsg = $<HTMLLabelElement>('statusMsg')
const methodSelect = $<HTMLSelectElement>('methodSelect')
const applyBtn = $<HTMLButtonElement>('applyBtn')
const saveBtn = $<HTMLButtonElement>('saveBtn')
const aboutBtn = $<HTMLButtonElement>('aboutBtn')
const aboutDialog = $<HTMLDialogElement>('aboutDialog')
const dicomPick = $<HTMLSelectElement>('dicomPick')

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
// True once the CURRENTLY displayed volume is a defaced result. Save is gated on
// this so a user can't download the un-defaced source under the name defaced.nii.gz
// (a privacy footgun for an anonymization tool). Reset when a new source loads.
let hasDefaced = false

const niimath = new Niimath()
let niimathReady: Promise<void> | null = null
niimath.setOutputDataType('input') // preserve source datatype on save (smaller output)

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
  loadingCircle.classList.toggle('hidden', !on)
}

// --- Button gating ---
function updateButtons(): void {
  const busy = isBusy()
  applyBtn.disabled = busy || !sourceFile || !refFiles
  methodSelect.disabled = busy
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
// state. Tear the worker down and clear niimathReady so the next run spins up a
// fresh one rather than reusing leaked/stale state. (Uses the same field access as
// cleanup(); the vendored wrapper exposes no public terminate.)
function resetNiimathWorker(): void {
  try {
    ;(niimath as unknown as { worker?: Worker }).worker?.terminate()
    ;(niimath as unknown as { worker: Worker | null }).worker = null
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

// --- Load ---
// asSource=true for user-supplied images (default/drop/dcm2niix pick) — these
// become the pristine input that Apply defaces. The defaced result is displayed
// with asSource=false so it never replaces the source.
async function loadFromFile(file: File, asSource = true): Promise<void> {
  await nv.loadVolumes([{ url: file, name: file.name } as ImageFromUrlOptions])
  if (isCleanedUp) return
  if (asSource) sourceFile = file
  // A freshly loaded source is NOT yet defaced; a deface result (asSource=false) is.
  hasDefaced = !asSource
  updateButtons()
}

// --- Deface ---
async function runDeface(): Promise<void> {
  if (!sourceFile || !refFiles) return
  spin(true)
  const method = methodSelect.value // 'spm_deface' | 'deface'
  // Single-threaded WASM: SPM rigid coreg is ~10–30 s; the affine -deface path is
  // markedly slower (~60 s on the default image), so set expectations per method.
  setStatus(
    method === 'spm_deface'
      ? 'Defacing with spm_deface… (single-threaded WASM, ~10–30 s)'
      : 'Defacing with deface (affine)… (single-threaded WASM, up to ~60 s)',
  )
  const t0 = performance.now()
  try {
    await ensureNiimath()
    if (isCleanedUp) return
    // -robustfov trims the FOV (neck) for a robust face mask; then register the
    // MNI template to the subject and zero the face voxels. Always run on the
    // pristine sourceFile so repeated Apply doesn't re-crop/re-deface the output.
    const chain = niimath.image(sourceFile).robustfov()
    const defaced =
      method === 'spm_deface'
        ? chain.spmDeface(refFiles.mni, refFiles.mask)
        : chain.deface(refFiles.mni, refFiles.mask)
    const blob = await defaced.run('defaced.nii.gz')
    if (isCleanedUp) return
    const out = new File([blob], 'defaced.nii.gz')
    await loadFromFile(out, false) // display result; keep sourceFile pristine
    const ms = Math.round(performance.now() - t0)
    setStatus(`Defaced with ${method} (${ms} ms)`)
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
  if (nv.volumes.length === 0) return
  await nv.saveVolume({ filename: 'defaced.nii.gz', volumeByIndex: 0 })
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
  } finally {
    spin(false)
  }
}

// --- Init ---
async function init(): Promise<void> {
  if (!navigator.gpu) {
    memstatus.textContent = 'WebGPU unavailable'
    memstatus.style.color = 'red'
    setStatus('This viewer needs WebGPU — try recent desktop Chrome, Edge, or Safari.')
    return
  }
  memstatus.textContent = 'WebGPU ready'
  memstatus.style.color = 'green'
  await attachNiiVue() // safe now that navigator.gpu is confirmed
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
    if (file) enqueue(() => loadFromFile(file))
  },
  ac,
)
applyBtn.addEventListener('click', () => enqueue(runDeface), ac)
saveBtn.addEventListener('click', () => void runSave(), ac)
aboutBtn.addEventListener('click', () => aboutDialog.showModal(), ac)

// --- Cleanup (HMR / tab close) ---
async function cleanup(): Promise<void> {
  if (isCleanedUp) return
  isCleanedUp = true
  listeners.abort()
  await pending
  try {
    ;(niimath as unknown as { worker?: Worker }).worker?.terminate()
  } catch {
    // worker may already be gone
  }
  ctx?.dispose() // null if WebGPU was unavailable (attachNiiVue never ran)
  nv.destroy()
}
window.addEventListener('pagehide', (e) => {
  if (e.persisted) return
  void cleanup()
}, { once: true, signal: listeners.signal })
if (import.meta.hot) import.meta.hot.dispose(cleanup)

updateButtons()
enqueue(init)
