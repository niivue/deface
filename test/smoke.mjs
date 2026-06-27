// Headless-WebGPU browser smoke for the deface app (Part C validation).
//
// Boots `vite preview` on the production build, drives it in headless Chromium
// with WebGPU via SwiftShader (the recipe niivue's own e2e suite uses:
// --use-gl=angle --enable-unsafe-swiftshader), and asserts the full path that
// node smoke can't reach: WebGPU/NiiVue attach, Vite worker URLs, the default
// image load, Apply (spm_deface, and -deface with SMOKE_FULL=1), Save→download,
// and that nothing throws to the page / logs to console.error.
//
// Usage:  npm run build && npm run test:e2e        (spm_deface only, ~fast)
//         SMOKE_FULL=1 npm run test:e2e            (also the slow affine -deface)
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// poll the server until it answers
async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch { /* not up yet */ }
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

  // 3. Apply spm_deface
  await page.selectOption('#methodSelect', 'spm_deface')
  await page.click('#applyBtn')
  await waitStatus(page, 'Defaced with spm_deface', 120000)
    .catch(() => fail('spm_deface did not complete', page))
  await page.screenshot({ path: join(here, 'smoke-spm_deface.png') })
  console.log('✓ spm_deface ran and displayed')

  // 4. Save → must produce a browser download (Save is gated on a completed deface,
  // so by here it is enabled). Fatal: a broken Save must fail the smoke.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('#saveBtn'),
  ]).catch(() => fail('Save did not produce a download', page))
  console.log('✓ Save produced a download:', download.suggestedFilename())

  // 5. (optional) the slow affine path
  if (FULL) {
    await page.selectOption('#methodSelect', 'deface')
    await page.click('#applyBtn')
    await waitStatus(page, 'Defaced with deface', 180000)
      .catch(() => fail('-deface (affine) did not complete', page))
    await page.screenshot({ path: join(here, 'smoke-deface.png') })
    console.log('✓ deface (affine) ran and displayed')
  } else {
    console.log('• skipped slow -deface path (set SMOKE_FULL=1 to include)')
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
