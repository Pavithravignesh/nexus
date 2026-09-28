// Starts a local mongod for development. No admin rights or service needed.
// Looks for mongod on PATH first, then in %LOCALAPPDATA%\Programs\MongoDB.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function findMongod() {
  const which = process.platform === "win32" ? "where" : "which";
  const probe = spawnSync(which, ["mongod"], { encoding: "utf8" });
  if (probe.status === 0) {
    const first = probe.stdout.split(/\r?\n/).find((l) => l.trim());
    if (first) return first.trim();
  }
  const base =
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Programs", "MongoDB")
      : join(homedir(), ".local", "mongodb");
  if (existsSync(base)) {
    for (const dir of readdirSync(base)) {
      const candidate = join(base, dir, "bin", process.platform === "win32" ? "mongod.exe" : "mongod");
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const mongod = findMongod();
if (!mongod) {
  console.error("mongod not found. Install MongoDB Community and add its bin folder to PATH.");
  process.exit(1);
}

const root = process.env.LOCALAPPDATA ?? join(homedir(), ".local");
const dbpath = join(root, "MongoDB", "data");
const logpath = join(root, "MongoDB", "logs");
mkdirSync(dbpath, { recursive: true });
mkdirSync(logpath, { recursive: true });

console.log(`Starting ${mongod}`);
console.log(`  dbpath: ${dbpath}`);
console.log(`  log:    ${join(logpath, "mongod.log")}`);

const child = spawn(
  mongod,
  ["--dbpath", dbpath, "--logpath", join(logpath, "mongod.log"), "--logappend", "--bind_ip", "127.0.0.1", "--port", "27017"],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
