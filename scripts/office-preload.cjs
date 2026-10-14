/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload loaded with --require; it has to use require() */
// Preload for `next dev --webpack` on a machine whose Application Control policy blocks native
// .node binaries. Loaded by scripts/dev-office.mjs through NODE_OPTIONS, so it reaches every Next worker.
//  1. lightningcss: serve its WebAssembly build (lightningcss-wasm) in place of the blocked native one.
//  2. @tailwindcss/oxide: its WASI fallback cannot read Windows paths, so Node reads the source
//     files and the WASI engine only extracts class candidates from their contents.
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
let wasmCss = null;
let realOxide = null;
let shim = null;

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "lightningcss-win32-x64-msvc") {
    wasmCss ??= path.join(root, "node_modules", "lightningcss-wasm", "wasm-node.cjs");
    return wasmCss;
  }
  return resolve.call(this, request, parent, ...rest);
};

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".next-verify", ".vercel", "coverage", "docs"]);
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".mdx"]);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(path.join(dir, e.name), out);
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(path.join(dir, e.name));
    }
  }
}

function makeShim() {
  // Absolute path, so this require does not come back through the hook below.
  realOxide ??= require(path.join(root, "node_modules", "@tailwindcss", "oxide"));
  class Scanner {
    constructor(opts = {}) {
      this.sources = opts.sources ?? [];
      this.engine = new realOxide.Scanner({ sources: [] });
      this.found = [];
    }
    scan() {
      const files = [];
      for (const s of this.sources) if (!s.negated) walk(s.base, files);
      const negated = this.sources.filter((s) => s.negated).map((s) => path.resolve(s.base));
      this.found = [...new Set(files)].filter((f) => !negated.some((n) => f.startsWith(n + path.sep)));
      return this.engine.scanFiles(this.found.map((f) => ({ content: fs.readFileSync(f, "utf8"), extension: path.extname(f).slice(1) })));
    }
    scanFiles(changed) {
      return this.engine.scanFiles(changed.map((c) => (c.file && c.content == null ? { content: fs.readFileSync(c.file, "utf8"), extension: c.extension ?? path.extname(c.file).slice(1) } : c)));
    }
    get files() {
      return this.found;
    }
    get globs() {
      return this.sources.filter((s) => !s.negated).map((s) => ({ base: s.base, pattern: s.pattern }));
    }
  }
  return { Scanner };
}

const load = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "@tailwindcss/oxide") return (shim ??= makeShim());
  return load.call(this, request, parent, ...rest);
};
