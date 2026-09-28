// Tiny static server for viewer.html (node docs/diagrams/serve.mjs)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html", ".excalidraw": "application/json", ".mjs": "text/javascript" };
createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try { const body = await readFile(join(dir, p === "/" ? "viewer.html" : p.slice(1)));
    res.writeHead(200, { "Content-Type": types[extname(p)] ?? "application/octet-stream" }); res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(4100, () => console.log("diagrams on http://localhost:4100"));
