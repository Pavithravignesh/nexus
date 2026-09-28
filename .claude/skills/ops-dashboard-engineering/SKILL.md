---
name: ops-dashboard-engineering
description: Engineering and UI/UX standards for the Nexus real-time Operations Dashboard (Next.js 16 + TypeScript + Tailwind + D3 + MongoDB + SSE, 10,000 simulated devices x 10 sensor types). Use this skill whenever you write, change, review, or debug ANY code in this project: a page, component, chart, route handler, the simulator, the SSE stream, the telemetry store, the device table, the drawer, theming, or seed data, even if the user does not say "standards", "architecture", "performance" or "UX".
---

# Ops dashboard engineering standards

The product: an operator opens one screen and, within five seconds, knows **how healthy the
fleet is, what is on fire, and where it is**. Then they drill into one device and see its
10 sensors and their recent history. Everything live over SSE; nothing polls.

Scoring reality (from the brief): 35% UX, 25% dashboard implementation, 20% real-time,
10% frontend architecture, 10% backend. Spend effort in that ratio. Backend is deliberately simple.

## 1. Architecture in one picture

```
Browser
  /  (single dashboard page)
     useSnapshot()   ─► GET /api/summary, /api/devices?limit=10000 (compact)   once, and after reconnect
     useLiveStream() ─► GET /api/stream  (SSE: summary, delta, alert, heartbeat)
            ▼
     TelemetryStore  (plain TS, outside React; useSyncExternalStore selectors)
            ▼
     KPI strip · Fleet health chart · Status donut · Zone heatmap · Sensor breach bars
     Alerts panel · Activity feed · Virtual device table · Device drawer (+ time series)

Next.js route handlers (src/app/api/**)          thin: parse with zod, call one service
        ▼
Services (src/server/services/*)                 summary, devices, history, stream hub
        ▼
Simulator engine (src/server/sim/*)              ONE in-process singleton, ticks every 1 s
        ├─► in-memory state + ring-buffer history (source of truth for "now")
        └─► repos (src/server/repos/*)            batched bulkWrite every FLUSH_INTERVAL_MS
                ▼
MongoDB: devices · latest_readings · events
```

Rules:
- **Route handlers are thin.** No business rules in `app/**`.
- **Services never import `next/*`** or touch `Request`/`Response`.
- **Repos are the only Mongo callers.** No collection names outside `src/server/db/`.
- **The simulator is a singleton on `globalThis`**, started from `src/instrumentation.ts`.
  Hot reload must not start a second one. One ticker for the whole fleet; SSE connections
  subscribe to the stream hub (an `EventEmitter`), they never own a timer.
- **Components never fetch.** Data arrives through hooks or the TelemetryStore.
- `src/shared/` (types, zod schemas, thresholds, status derivation) is imported by both
  server and browser and must not import Node-only modules.

Full folder layout: `references/architecture.md`.

## 2. Domain rules (see CONTEXT.md for vocabulary)

- 10,000 **Devices**, each with the same 10 **Sensor types**: temperature, humidity, co2,
  o2, no2, pm25, pm10, pressure, noise, occupancy. Units and thresholds live in
  `src/shared/sensors.ts`, the single source.
- **Location** is `site > floor > zone > room > rack`. Devices are spread over
  4 floors x 6 zones so the heatmap is readable.
- **Reading status** comes from thresholds: NORMAL, WARNING, CRITICAL.
- **Device status** is the worst reading status, or OFFLINE when `lastSeen` is older than
  `OFFLINE_AFTER_MS`. A reading older than `STALE_AFTER_MS` (but not offline) is **stale**:
  it shows dimmed with its age; it never shows as fresh.
- Derived numbers (KPI counts, distributions) are computed from state, never hand-edited.
  `deriveStatus()` and `summarize()` are pure functions in `src/shared/` with unit tests.

## 3. Real-time contract (SSE)

`GET /api/stream`, `text/event-stream`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

| event | when | payload |
|---|---|---|
| `hello` | on connect | `{ serverTime, seq, tickMs }` |
| `summary` | every tick | KPI counts, per-status, per-sensor breaches, per-zone worst counts, fleet-health point |
| `delta` | every tick | only changed devices, packed: `[deviceIdx, status, lastSeenMs, v0..v9]` |
| `alert` | on transition | raised / cleared alert objects |
| `: hb` | every 15 s | comment heartbeat |

- Every frame has `id: <seq>`. On reconnect the client refetches the snapshot once, then
  resumes the stream (a one-off refetch on reconnect is not polling).
- Payloads are validated with the shared zod schemas on the client; bad frames are dropped
  with a console warning, never crash the UI.
- Clean up listeners on `request.signal` abort. Log connect/disconnect counts.
- Details, wire examples and failure table: `references/sse.md`.

## 4. Frontend performance rules (non-negotiable)

- **Never put 10k devices in React state.** The `TelemetryStore` holds them in typed
  arrays/Maps and exposes `subscribe(key, cb)` + `getSnapshot`. Components read via
  `useSyncExternalStore` selectors so only what changed re-renders.
- **Batch to animation frames.** Deltas are applied immediately to the store, but
  notifications are coalesced with `requestAnimationFrame`.
- **Table is virtualized** (`@tanstack/react-virtual`); rows are `memo` and subscribe to
  their own device. Sorting/filtering runs on a derived index list recomputed at most
  every `RESORT_MS` (or on user action) so rows do not jump under the cursor.
- Charts consume aggregates (summary), never raw 100k readings.
- No full-page refreshes, no `key` churn on containers, no layout shift when data arrives.
- `references/realtime-client.md` has the store and hook patterns.

## 5. UI/UX system rules

- **Hierarchy (top to bottom):** connection/status bar > KPI strip > fleet health + alerts
  > location + sensor distribution > device table. Critical things are always above the fold.
- **Status is never colour alone:** each status has colour + icon + label. Offline also
  uses a dashed border / hatch. Tokens in `globals.css`, never hard-coded hex in components.
- **Themes:** dark default (control-room), light supported, via CSS variables on
  `[data-theme]`; persisted in `localStorage`; no flash on load.
- **States for every panel:** skeleton (loading), empty (with a hint), error (with retry),
  disconnected (banner + "last update Xs ago", data dimmed, not blanked), stale.
- **Motion helps, never distracts:** value changes use a brief tint flash; new critical
  alerts slide in; respect `prefers-reduced-motion`. No bouncing, no looping pulses except
  a single subtle live dot.
- **Numbers:** tabular figures (`font-variant-numeric: tabular-nums`), units always shown,
  thousands separators, fixed decimals per sensor.
- **Accessibility:** every interactive element reachable by keyboard, visible focus ring,
  `Esc` closes the drawer, `/` focuses search, `aria-live="polite"` for the alert count.
- Full token table, spacing scale and component specs: `references/ui-system.md`.

## 6. TypeScript and API rules

- `strict`, `noUncheckedIndexedAccess`. No `any`; parse unknown shapes with zod.
- Every JSON route returns `{ ok: true, data } | { ok: false, error: { code, message } }`.
- Minimum APIs: `GET /api/devices` (search, filter, limit/cursor), `GET /api/devices/[id]`,
  `GET /api/devices/[id]/history?sensor=&window=`, `GET /api/telemetry/latest`,
  `GET /api/summary`, `GET /api/stream`, plus `GET /api/health`.
- D3 computes, React renders (d3-scale / d3-shape / d3-array only; no DOM mutation).
  Chart width from `useResizeObserver`, never `window`.

## 7. Before you say a change is done

1. `npm run typecheck` and `npm run lint` are clean.
2. Touched `*.test.ts` files pass (`npx vitest run <file>`).
3. `npm run dev`; `/api/health` is ok; the dashboard shows live changes within 2 s.
4. Kill and restart the dev server: the UI shows the disconnected state, then recovers on its own.
5. DevTools Performance: scrolling the table while live stays smooth (no long tasks > 50 ms).
6. Both themes checked at 1366x768 and 1920x1080.

Say which of these you ran. Never imply an unrun check passed.

## 8. Tempting but wrong here

- A per-connection `setInterval` generating data (two tabs = two fleets). Use the hub.
- `setState` for every delta, or one giant context holding all devices.
- Re-sorting the table on every tick.
- Rendering 10k rows or 10k SVG nodes.
- Writing every tick to Mongo row by row. Batch with `bulkWrite`, unordered.
- Colour-only status, spinners instead of skeletons, blanking data on disconnect.
