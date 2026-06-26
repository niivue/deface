// Ambient types for the Emscripten-generated niimath.js (GPL build).
// worker.ts imports the default export and calls it to instantiate the module;
// the real runtime shape is cast to its own EmscriptenModule interface there.
declare const Module: (options?: Record<string, unknown>) => Promise<unknown>
export default Module
