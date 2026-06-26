# niimath-gpl — vendored GPL niimath WASM

Generated artifact, not hand-edited. This is the **GPL-2** build of niimath (SPM
`spm_coreg` defacing via `-spm_deface`, plus BSD `-deface`/`-allineate`). Because
it links the GPL `spm_coreg` module, a binary built with it is a GPL-2 combined
work — which is why it lives here in the GPL-2 `deface` app rather than in the
BSD `@niivue/niimath` npm package.

`niimath.js`/`niimath.wasm` plus the `index.ts`/`worker.ts`/`types.ts`/
`niimathOperators.json` wrappers are copied verbatim from `rordenlab/niimath`
(`js/src/`). The wrappers are build-agnostic; only the WASM differs (GPL vs BSD).

## Regenerate

From a niimath checkout with the GPL submodule initialized and emsdk active:

```bash
cd niimath/js
GPL=1 make wasm -C ../src                              # build GPL niimath.{js,wasm}
bun run scripts/pre-build.ts -i src/niimath.js -o <deface>/src/niimath-gpl/niimath.js
cp src/niimath.wasm src/worker.ts src/index.ts src/types.ts \
   src/niimathOperators.json <deface>/src/niimath-gpl/
make wasm -C ../src && bun run scripts/pre-build.ts -i src/niimath.js -o src/niimath.js  # restore BSD wasm
```

The `pre-build` step rewrites `args=[]` → `args` in the Emscripten glue (required
for `callMain` to receive the argv). `niimath.d.ts` is the hand-written type shim
for the generated `niimath.js` default export.

## Provenance

GPL compliance: this binary's corresponding source is the niimath tree + its
`src/GPL` submodule at the SHAs below. **Record both at every vendor/regenerate.**

- niimath commit: `31c92ca52ba9f9706275ac61808b95c936d48fd8`
- `src/GPL` submodule commit: `fb83d62a90b3eb8886fadad3768fce4002b0964d`
- emscripten: `emcc 6.0.1`
- `niimath.wasm` SHA-256: `e6eaad49a7e6e2c664a5b0bcbaa19fc0fd5df404499fba8d847dc966f6c45a84`

The `GPL=1 make wasm` build is **byte-for-byte deterministic** (verified: two clean
builds and this vendored copy share the SHA-256 above), so the artifact is fully
reproducible by checking out the niimath commit above (with `src/GPL` at the listed
submodule commit) and running `GPL=1 make wasm`.
