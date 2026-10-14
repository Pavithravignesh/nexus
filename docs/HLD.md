# Nexus: High-Level Design

A real-time operations dashboard for 10,000 simulated devices with 10 sensors each.
The server keeps the whole fleet in memory and pushes the changes once a second over
Server-Sent Events. Each browser tab keeps its own copy in a store outside React and
re-renders only what changed.

## Documents

| Document | What it shows | Open with |
|---|---|---|
| [`HLD.html`](HLD.html) | **As built, with diagrams**: system architecture, page-load and live-loop sequence, alert-acknowledge flow, layers, endpoints, plan-vs-build, decisions | Any browser (double-click) |
| [`diagrams/01-hld.excalidraw`](diagrams/01-hld.excalidraw) | **The original plan** (28 Sep 2026), drawn before the build | `npm run diagrams` → http://localhost:4100, or excalidraw.com → Open |
| [`diagrams/02-architecture.excalidraw`](diagrams/02-architecture.excalidraw) | Original architecture diagram | same |
| [`diagrams/03-wireframe.excalidraw`](diagrams/03-wireframe.excalidraw) | Original UI wireframe | same |
| [`design/style-directions.html`](design/style-directions.html) | Interactive prototype of three visual directions (Industrial 3D Control Room was chosen) | Any browser |

The excalidraw files are kept as the plan on purpose; `HLD.html` is the current design. The differences are listed under [From plan to build](#from-plan-to-build).

## Architecture

```
Browser (each tab)                          Next.js server (one Node process)                 MongoDB (optional)
──────────────────                          ─────────────────────────────────                 ──────────────────
Components ◄── notifies changed topics      instrumentation.ts → runtime.ts (boots once)
    │                                        
TelemetryStore (typed arrays, outside React)
    ▲ apply…()                               SimEngine ── TickResult / 1 s ──► StreamHub
TelemetryProvider ◄══════ SSE, 1 Hz ═══════ /api/stream ◄── one string ─────┘
    │ snapshot                                   ▲ reads · acks
client/api.ts fetchJson() ◄── REST ──► app/api/*/route.ts ──► services ──► SimEngine
                                                                SimEngine ── takeDirty / 5 s ──► persistence → repos ──► devices
                                                                                                                         latest_readings
                                                                                                                         events (TTL)
                                                                                                                         settings
```

### Layers

| Layer | Folder | Responsibility |
|---|---|---|
| UI components | `src/components/` | KPIs, 3D control room, alerts, charts, device table, drawer, insights. Read the store; never hold the fleet in React state. |
| Browser data layer | `src/client/` | `TelemetryProvider` (snapshot, then EventSource), `TelemetryStore` (typed arrays, topic and row subscriptions, one notification per animation frame), stream metrics, `fetchJson()` (unwraps the envelope, validates with zod). |
| UI helpers | `src/hooks/`, `src/lib/` | UI-only hooks (saved views, focus trap) and pure helpers (filters, pagination). |
| Contract | `src/shared/` | Sensors, status rules, thresholds, layout, summary maths, types, and the zod schemas for every API and stream message. Imported by server and browser. |
| API | `src/app/api/` | Thin handlers: zod-validate input, call a service, return `{ ok, data }` or `{ ok, error }` through `handleRoute()`. |
| Wiring | `src/server/runtime.ts` | Composition root: one SimEngine, one StreamHub, the 1 s tick and 5 s flush timers, the persistence hooks. |
| Services | `src/server/services/` | Business logic over the engine: device list/detail/history, acknowledge, thresholds, events. |
| Simulation | `src/server/sim/`, `src/server/insights/` | The single source of live truth: 10,000 × 10 readings in typed arrays, alerts, events, a ~5-minute history ring; the anomaly detector. Ticks every second. |
| Streaming | `src/server/stream/` | `StreamHub` serialises each tick once and fans it out; `sse-response` serves one SSE connection. |
| Persistence | `src/server/persistence/` | Attach, flush and retry (`persistence.ts`); MongoDB access, one repo per collection (`repos/`, `db/`). Optional: without `MONGODB_URI` the app runs from memory. |

### Data flow

1. **Snapshot.** On load the provider fetches `/api/fleet`, `/api/telemetry/latest`,
   `/api/summary` and `/api/thresholds` in parallel and fills the store.
2. **Stream.** It then opens `EventSource("/api/stream")`: a `hello` frame, then every second
   `summary`, `delta` (only devices that changed, ~10–15%), `alert` when alerts change and
   `insight`. Threshold edits arrive as a `thresholds` frame.
3. **Render.** The store applies each frame and notifies only the topics and rows that
   changed, once per animation frame.
4. **Reconnect.** On a drop the browser retries with exponential backoff and reloads the
   snapshot once. There is no polling.
5. **Actions.** Acknowledge (`POST /api/alerts/{id}/ack`) and threshold edits
   (`PUT /api/thresholds`) update the clicked tab at once, then the server broadcasts the
   change to every tab without waiting for the next tick.
6. **Persistence.** Every 5 s the engine hands over what changed (`takeDirty()`), and it is
   bulk-written to MongoDB. If MongoDB is down the app keeps running and retries every 15 s.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| SSE | `/api/stream` | hello, then summary · delta · alert · insight every second, thresholds on change |
| GET | `/api/fleet` | Device metadata (columnar) for the snapshot |
| GET | `/api/telemetry/latest` | Every device as a packed row for the snapshot |
| GET | `/api/summary?alerts=N` | Counts by status, sensor and zone, plus top open alerts |
| GET | `/api/devices` | Search, filter, sort, page |
| GET | `/api/devices/{id}` | One device: readings, open alert, recent events |
| GET | `/api/devices/{id}/history` | Time series for a sensor and window |
| GET | `/api/events` | Stored events, newest first, cursor paging |
| POST | `/api/alerts/{id}/ack` | Acknowledge an alert; broadcast to all tabs |
| GET · PUT · DELETE | `/api/thresholds` | Read, replace or reset alarm limits; broadcast to all tabs |
| GET | `/api/health` | Uptime, tick, connections, MongoDB status |

### Key decisions

- **SSE, not WebSockets:** traffic is one-way, EventSource reconnects by itself, plain HTTP.
- **One simulator and one hub:** connections never own a timer; each tick is serialised once for all tabs.
- **Deltas, not full frames:** only devices that reported or changed status.
- **No React state for 10,000 devices:** typed arrays in a store outside React, subscribed by topic or row.
- **Memory first, database second:** hot state in memory, bulk writes to MongoDB every 5 s.
- **zod at every boundary:** queries, bodies, responses and stream frames, with schemas shared by both sides.

## From plan to build

What changed between the 28 Sep plan (`diagrams/01-hld.excalidraw`) and the code:

| Area | Plan | Built |
|---|---|---|
| Browser hooks | Separate `useSnapshot` and `useLiveStream` | One `TelemetryProvider` owns both, so the snapshot reload after a reconnect is coordinated with the stream |
| History | 15-minute ring buffer | ~5 minutes (150 samples, one every 2 s), enough for the drawer chart |
| Alerts | Read-only | Acknowledge, broadcast to every tab within a second (`POST /api/alerts/{id}/ack`) |
| Alarm limits | Fixed | Editable at runtime (`/api/thresholds`), re-evaluated across all 100,000 readings, saved in a new `settings` collection |
| Events | Written to MongoDB only | Also readable: `GET /api/events` with cursor paging, shown as the device timeline |
| Stream frames | hello · summary · delta · alert | Also `thresholds` and `insight` |
| Data model page | Not planned | `/model`: live entity diagram with real samples |
| Predictive insights | Not planned | Online anomaly detector in `src/server/insights/` (in progress; see `AI-LOG.md`) |
| Folder layout | `services/` held business logic, streaming and persistence; client store in `lib/` | Split on 14 Oct 2026: `services/` (business logic), `stream/`, `persistence/`, `runtime.ts` (wiring), and `client/` (browser data layer) |
| Hosting | Local single process | Also runs on Vercel; each serverless instance has its own simulator, which only ticks while a tab is connected |
