# AI usage log

Kept for the interview question "which parts were AI-generated, and what did you debug, change, or improve?"

| When | What AI produced | What I reviewed / changed / debugged |
|---|---|---|
| 2026-09-28 | Project setup: CLAUDE.md, CONTEXT.md, `ops-dashboard-engineering` skill (adapted from my `try_cladue` dashboard-engineering skill), skills picked from mattpocock/skills | |
| 2026-09-28 | Excalidraw HLD, architecture and wireframe (`docs/diagrams/`) | Found the charts too basic; asked for a more futuristic direction |
| 2026-09-28 | `docs/design/style-directions.html`: 3 visual directions with a live 10k-device simulation, interactive charts, data-model tab, three.js scenes | Picked Industrial 3D Control Room; asked to replace the line chart and donut. Bugs caught while building: pressure/O2 baselines outside thresholds (~20% critical), anomalies never expiring, canvas scroll hijacked by 3D zoom (now ctrl+scroll), bloom washing out the scene |
