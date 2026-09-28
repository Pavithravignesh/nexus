# AI usage log

Kept for the interview question "which parts were AI-generated, and what did you debug, change, or improve?"

| When | What AI produced | What I reviewed / changed / debugged |
|---|---|---|
| 2026-09-28 | Project setup: CLAUDE.md, CONTEXT.md, `ops-dashboard-engineering` skill (adapted from my `try_cladue` dashboard-engineering skill), skills picked from mattpocock/skills | |
| 2026-09-28 | Excalidraw HLD, architecture and wireframe (`docs/diagrams/`) | Found the charts too basic; asked for a more futuristic direction |
| 2026-09-28 | `docs/design/style-directions.html`: 3 visual directions with a live 10k-device simulation, interactive charts, data-model tab, three.js scenes | Picked Industrial 3D Control Room; asked to replace the line chart and donut. Bugs caught while building: pressure/O2 baselines outside thresholds (~20% critical), anomalies never expiring, canvas scroll hijacked by 3D zoom (now ctrl+scroll), bloom washing out the scene |
| 2026-09-28 | P0 build (Claude Code): shared domain, simulator engine + hub, MongoDB persistence and seed, REST routes, SSE stream, TelemetryStore + provider, dashboard UI; 80 unit tests | Bugs caught and fixed during the build: engine test assumed offline devices stay offline (rewritten to check the rule every tick); offline share drifted to 8.6% (come-back probability raised, long-run test added); /api/health showed persistence detached because Next bundles instrumentation separately (state moved to globalThis); persisted event ids would collide across restarts (boot id prefix); mongod could not bind from the sandboxed shell (started from PowerShell); React lint flagged setState in effects in the drawer (moved to a store subscription); table overflowed its column and the drawer was see-through (fixed after checking in the browser). Scope cut at the time box: 3D hero and P1 charts left for later. |
