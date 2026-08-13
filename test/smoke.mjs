// Headless-WebGPU browser smoke for the deface app (Part C validation).
//
// Boots `vite preview` on the production build, drives it in headless Chromium
// with WebGPU via SwiftShader (the recipe niivue's own e2e suite uses:
// --use-gl=angle --enable-unsafe-swiftshader), and asserts the full path that
// node smoke can't reach: WebGPU/NiiVue attach, Vite worker URLs, the default
// image load, Apply (allineate fast, and allineate Hellinger with SMOKE_FULL=1),
// Save→download, and that nothing throws to the page / logs to console.error.
//
// Usage:  npm run build && npm run test:e2e        (allineate fast only, ~fast)
//         SMOKE_FULL=1 npm run test:e2e            (also the slow Hellinger path)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PORT = 4173
const URL = `http://localhost:${PORT}/deface/`
const FULL = process.env.SMOKE_FULL === '1'

// --- boot vite preview ---
// detached so the child is its own process-group leader; killing -pid then reaps
// the whole group (vite + its esbuild children). A plain preview.kill() would only
// signal the `npx` wrapper and orphan the actual server, leaking port 4173.
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  detached: true,
})
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  try { process.kill(-preview.pid, 'SIGTERM') } catch { /* already gone */ }
}
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

// --strictPort makes vite exit non-zero on a port clash; catch that so the test
// fails fast instead of polling a port served by some other (stale) process.
let previewExited = false
let previewExitCode = null
preview.on('exit', (code) => { previewExited = true; previewExitCode = code })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// poll the server until it answers
async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (previewExited) {
      throw new Error(`vite preview exited (code ${previewExitCode}) before ready — port ${PORT} clash?`)
    }
    let ok = false
    try {
      ok = (await fetch(URL)).ok
    } catch { /* not up yet */ }
    if (ok) {
      // The port answered — but confirm it's OUR preview, not a STALE server that won the
      // port and forced our --strictPort child to exit (which would silently validate a
      // stale build). A strictPort bind failure exits the child within a few hundred ms,
      // so settle briefly and re-check before trusting the server.
      await wait(500)
      if (previewExited) {
        throw new Error(
          `port ${PORT} is served by another process — our --strictPort preview exited (code ${previewExitCode}); refusing to test a stale server`,
        )
      }
      return
    }
    await wait(300)
  }
  throw new Error('vite preview did not come up')
}

let browser
const fail = async (msg, page) => {
  console.error('\n❌ SMOKE FAIL:', msg)
  if (page) await page.screenshot({ path: join(here, 'smoke-fail.png') }).catch(() => {})
  if (browser) await browser.close().catch(() => {})
  cleanup()
  process.exit(1)
}

// Wait until the status label CONTAINS `m`. Passed as a real function (+ arg) so
// Playwright actually evaluates the predicate each poll — a STRING `() => …` would
// be evaluated to a truthy function object and pass immediately (a silent no-op).
const waitStatus = (page, m, timeout) =>
  page.waitForFunction(
    (needle) => (document.getElementById('statusMsg')?.textContent || '').includes(needle),
    m,
    { timeout },
  )

try {
  await waitForServer()
  // Use the system Google Chrome (channel) rather than Playwright's bundled
  // browser — it has full WebGPU and avoids a separate browser download. The
  // swiftshader/angle flags are a software-rendering fallback for headless.
  browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,960'],
  })
  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto(URL, { waitUntil: 'domcontentloaded' })

  // 1. App initialized: Apply enables only after init() runs attachNiiVue() (NiiVue
  // attaches) AND the default image + MNI template load — so this single wait
  // subsumes the old explicit WebGPU-ready check (the #memstatus indicator was
  // removed; init failure leaves Apply disabled and this fails with a clear msg).
  await page.waitForSelector('#applyBtn:not([disabled])', { timeout: 30000 })
    .catch(() => fail('Apply never enabled (NiiVue attach / default image / refs not ready)', page))
  // M2 privacy guard: Save must be DISABLED before any deface, so the un-defaced
  // source can't be downloaded as defaced.nii.gz.
  if (!(await page.isDisabled('#saveBtn'))) await fail('Save enabled before any deface (M2 privacy footgun)', page)
  console.log('✓ App initialized (NiiVue attached, default image + refs loaded), Save correctly disabled pre-deface')

  // Image picker is populated and points at the bundled default. Only the presence/wiring
  // is asserted — actually selecting a remote demo image would make the smoke depend on
  // raw.githubusercontent.com, which would be flaky offline/in CI.
  const picker = await page.evaluate(() => {
    const s = document.getElementById('imageSelect')
    return s ? { n: s.options.length, value: s.value } : null
  })
  if (!picker || picker.n < 2 || picker.value !== 't1_crop')
    await fail(`image picker not populated/defaulted (${JSON.stringify(picker)})`, page)
  console.log(`✓ Image picker populated (${picker.n} entries, default "${picker.value}")`)

  // 3. Apply the default allineate (fast) deface — fast engine, no WebGPU needed. The
  // four allineate variants are two shared flags (crop / cost), not separate code paths,
  // so the default path exercises the wiring; robustfov/Hellinger differ only in argv.
  await page.selectOption('#methodSelect', 'allineate')
  await page.click('#applyBtn')
  await waitStatus(page, 'Defaced with allineate (fast)', 120000)
    .catch(() => fail('allineate (fast) did not complete', page))
  await page.screenshot({ path: join(here, 'smoke-allineate-fast.png') })
  console.log('✓ allineate (fast) ran and displayed')

  // 4. Save → must produce a browser download (Save is gated on a completed deface,
  // so by here it is enabled). Fatal: a broken Save must fail the smoke.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('#saveBtn'),
  ]).catch(() => fail('Save did not produce a download', page))
  console.log('✓ Save produced a download:', download.suggestedFilename())

  // 4a. reface — a genuinely distinct niimath op (`-reface`, three staged file operands)
  // plus the lazy ~10 MB template fetch, so it gets its own run. The rescalp/robustfov
  // variants differ only by which shell file and an argv flag, so one run covers the path.
  await page.selectOption('#methodSelect', 'reface')
  await page.click('#applyBtn')
  await waitStatus(page, 'Refaced with reface', 180000)
    .catch(() => fail('reface did not complete', page))
  await page.screenshot({ path: join(here, 'smoke-reface.png') })
  console.log('✓ reface ran and displayed')

  // 4b. mindgrab, via @brainchop/mindgrab. THREE outcomes are acceptable here and
  // exactly three, because what this browser can offer is not knowable in advance:
  // headless SwiftShader has no shader-f16, so WebGPU is out, and whether its WebGL2
  // is usable is the software rasterizer's business. So accept a completed run, the
  // capability dialog, or a status carrying the package's own refusal — and fail on
  // anything else, including silence. An arbitrary "Failed: …" is NOT accepted: the
  // point of this check is that the app never quietly does nothing, and a failure it
  // cannot name is exactly the case that would slip through.
  //
  // The page is NOT cross-origin isolated (vite preview sends no COOP/COEP, matching
  // GitHub Pages), so the threaded CPU module is off the table by design.
  await page.selectOption('#methodSelect', 'mindgrab')
  await page.click('#applyBtn')
  const outcome = await page
    .waitForFunction(
      () => {
        if (document.getElementById('webgpuDialog')?.open === true) return { kind: 'dialog' }
        const status = document.getElementById('statusMsg')?.textContent || ''
        if (status.includes('Brain-extracted with mindgrab')) return { kind: 'ran', status }
        // BrainchopError messages name the backend that refused and why.
        if (status.startsWith('Failed:') &&
            /webgpu|webgl2|cpu backend|cross-origin|adapter|shader-f16|mindgrab/i.test(status))
          return { kind: 'refused', status }
        return false
      },
      undefined,
      { timeout: 120000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null)
  if (!outcome)
    await fail('mindgrab neither completed, nor showed the dialog, nor named a refusal', page)
  if (outcome.kind === 'ran') {
    // The status carries the backend that actually ran, so this line is evidence
    // of WHICH path was exercised rather than merely that one was.
    await page.screenshot({ path: join(here, 'smoke-mindgrab.png') })
    console.log(`✓ mindgrab ran and displayed — ${outcome.status}`)
  } else if (outcome.kind === 'dialog') {
    console.log('✓ mindgrab gated on a browser with no usable backend (dialog shown)')
    await page.click('#webgpuDialog button') // dismiss so it doesn't mask later checks
  } else {
    console.log(`✓ mindgrab refused legibly — ${outcome.status}`)
  }
  // The border/robustfov variants differ only by one CLI flag into the same module and
  // an upstream `-robustfov` crop. One mindgrab outcome covers the app wiring.

  // 5. (optional) the slow exhaustive Hellinger path (`-cost hel`). Single-threaded WASM,
  // minutes on a full-head scan — hence gated behind SMOKE_FULL.
  if (FULL) {
    await page.selectOption('#methodSelect', 'allineate_hel')
    await page.click('#applyBtn')
    await waitStatus(page, 'Defaced with allineate (Hellinger)', 300000)
      .catch(() => fail('allineate (Hellinger) did not complete', page))
    await page.screenshot({ path: join(here, 'smoke-allineate-hel.png') })
    console.log('✓ allineate (Hellinger) ran and displayed')
  } else {
    console.log('• skipped slow Hellinger path (set SMOKE_FULL=1 to include)')
  }

  // 6. Fatal on any uncaught page error OR console.error. The app is expected to
  // run clean (niimath chatter is buffered, the favicon 404 is suppressed); a
  // console error means a real regression. If a benign third-party error ever
  // appears, narrow it with an explicit allowlist here rather than downgrading.
  if (pageErrors.length) await fail('uncaught page errors:\n  ' + pageErrors.join('\n  '), page)
  if (consoleErrors.length) await fail('console.error output:\n  ' + consoleErrors.join('\n  '), page)
  console.log('✓ no console.error output')

  console.log('\n✅ SMOKE PASS')
  await browser.close()
  cleanup()
  process.exit(0)
} catch (e) {
  await fail(e?.stack || String(e))
}
