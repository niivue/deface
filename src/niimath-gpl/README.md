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

- niimath commit: `5700b44cc6f5713ebb2f6bddc46b7ba0ee834e32`
- `src/GPL` submodule commit: `18c7c2c768d93b581ef294e5673794d4c0e05dc9`
- emscripten: `emcc 6.0.1`
- `niimath.wasm` SHA-256: `ff35ab190fb92e1964587518081a489d171d52017fc8c4da9c5260897c6a3c8f`

The `GPL=1 make wasm` build is **byte-for-byte deterministic** (verified: two clean
builds and this vendored copy share the SHA-256 above), so the artifact is fully
reproducible by checking out the niimath commit above (with `src/GPL` at the listed
submodule commit) and running `GPL=1 make wasm`.
