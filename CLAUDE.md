@AGENTS.md

# Nexus Ops Dashboard

Real-time Operations Dashboard for 10,000 simulated devices x 10 sensor types.
Next.js 16 (App Router) + TypeScript + Tailwind v4 + D3 (compute only) + MongoDB + Server-Sent Events.
Interview assignment: 2 h expected, 3 h max. Scoring: UX 35%, dashboard implementation 25%,
real-time 20%, frontend architecture 10%, backend 10%. Optimise for that ratio.

## Commands

```bash
npm run db          # start local mongod (script reused from try_cladue)
npm run seed        # idempotent: 10,000 devices + initial readings
npm run dev         # :3000 (or preview_start "dashboard")
npm run typecheck
npm run lint
npm test            # vitest run
```

## Engineering standards

Every change follows the `ops-dashboard-engineering` skill: layering (thin routes → services →
sim/repos), one simulator singleton + stream hub, TelemetryStore outside React, virtualized
table, zod at every boundary, `{ ok, data } | { ok, error }` envelope, UI tokens and states.
Read it before touching `src/`.

## Domain docs

Single context. Vocabulary is in `CONTEXT.md`; use its terms in code, tests and UI copy.
Design docs: `docs/HLD.md` and `docs/diagrams/*.excalidraw` (HLD, architecture, wireframe).
Decisions hard to reverse go in `docs/adr/` via `domain-modeling`.

## Skills

Model-invoked: `ops-dashboard-engineering`, `tdd`, `diagnosing-bugs`, `codebase-design`,
`domain-modeling`, `prototype`, `grilling`, `two-axis-code-review`.
User-invoked: `/grill-me`, `/grill-with-docs`, `/implement`, `/handoff`, `/wait-what`.

## Priorities (do not reorder without asking)

P0 (must, first ~90 min): simulator + SSE, TelemetryStore, KPI strip, alerts panel,
status visuals, virtual table with search/filter/sort, device drawer with time series,
connection states, dark theme.
P1 (next ~45 min): zone heatmap, sensor breach bars, fleet health area, activity feed,
light theme toggle, skeletons, empty/error states, keyboard shortcuts.
P2 (only if time remains): alert ack, threshold config, saved filters, animations polish.

## AI log

Keep `docs/AI-LOG.md` updated: what was generated, what was changed or debugged and why.
The interview asks about this.

## Conventions

- Never weaken `tsconfig` strictness or use `any`; parse unknown shapes with zod.
- No polling anywhere (no `setInterval` + fetch). Real-time only through `/api/stream`.
- Never paste `.env` contents; reference variables by name.
- Commit in small steps after each green unit of work; never push unless asked.
- The folder is under OneDrive: if git shows `index.lock` errors, pause OneDrive sync.
