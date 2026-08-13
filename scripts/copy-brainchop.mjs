#!/usr/bin/env node
// Stage @brainchop/mindgrab's wasm modules into public/ so Vite serves them.
//
// They cannot be left in node_modules and imported: the package loads its
// emscripten glue by a COMPUTED URL, and each glue file then finds its own
// .wasm through its own import.meta.url -- so Vite neither rewrites the import
// nor emits the assets, and the pair has to stay adjacent and unhashed.
// public/ is exactly the directory that preserves names, in dev and in the
// build alike, so the copies land at <base>brainchop/ and `assetPath` points
// there. See js/README.md's "Bundlers" section in the brainchop-c repo.
//
// MindGrab only. The package also carries the 18-class model's three backend
// pairs; this app never asks for that model, so those stay in node_modules
// rather than shipping ~1.5 MB to every visitor.
//
// index.js is deliberately NOT copied: Vite bundles the package entry from the
// `import` in main.ts, and worker.js is a standalone bundle that does not
// import it.

import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '..', 'node_modules', '@brainchop', 'mindgrab', 'dist')
const to = join(here, '..', 'public', 'brainchop')

const files = [
  'worker.js',
  'brainchop-mindgrab-gpu.js', 'brainchop-mindgrab-gpu.wasm',
  'brainchop-mindgrab-gl.js', 'brainchop-mindgrab-gl.wasm',
  'brainchop-mindgrab.js', 'brainchop-mindgrab.wasm',
]

mkdirSync(to, { recursive: true })
for (const f of files) copyFileSync(join(from, f), join(to, f))
console.log(`copy-brainchop: staged ${files.length} files into public/brainchop/`)
