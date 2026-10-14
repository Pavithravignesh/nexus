// `npm run dev:office`: run the dev server on a machine whose Application Control policy blocks
// native .node binaries (Next's SWC, Turbopack, lightningcss, Tailwind oxide).
//  - Next falls back to its WebAssembly SWC by itself; only Webpack accepts that, so --webpack.
//  - lightningcss and Tailwind oxide get WebAssembly builds, installed with --no-save so package.json
//    and the lockfile stay untouched (a later `npm install` removes them; this script re-adds them).
//  - scripts/office-preload.cjs routes both to those builds inside every Next worker.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const version = (pkg) => JSON.parse(readFileSync(path.join(root, "node_modules", pkg, "package.json"), "utf8")).version;
const wasm = [
  ["lightningcss-wasm", version("lightningcss")],
  ["@tailwindcss/oxide-wasm32-wasi", version("@tailwindcss/oxide")],
];

const missing = wasm.filter(([pkg]) => !existsSync(path.join(root, "node_modules", pkg)));
if (missing.length) {
  const specs = missing.map(([pkg, v]) => `${pkg}@${v}`);
  console.log(`Installing WebAssembly builds (not saved to package.json): ${specs.join(" ")}`);
  const r = spawnSync("npm", ["install", "--no-save", "--force", ...specs], { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Output left by an earlier Turbopack attempt makes Webpack fail with EPERM under OneDrive.
rmSync(path.join(root, ".next", "dev"), { recursive: true, force: true });

// Forward slashes: inside a quoted NODE_OPTIONS value a backslash is an escape character.
const preload = path.join(root, "scripts", "office-preload.cjs").replace(/\\/g, "/");
const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require="${preload}"`, "--no-warnings=ExperimentalWarning"].filter(Boolean).join(" "),
};
const child = spawn("npx", ["next", "dev", "--webpack", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
