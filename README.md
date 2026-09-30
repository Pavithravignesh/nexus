# nexus

A real-time Operations Dashboard that monitors 10,000 simulated devices, each sending telemetry from 10 sensor types: Temperature, Humidity, CO2, O2, NO2, PM2.5, PM10, Pressure, Noise and Occupancy. It should look and feel like a commercial monitoring product, not a CRUD app or a demo.

**Stack:** Next.js 16 (App Router) · TypeScript (strict) · Tailwind v4 · D3 (maths only) · MongoDB · Server-Sent Events · Vitest

## Run it

Requirements: Node 20+, MongoDB Community installed locally (`mongod` on PATH or under `%LOCALAPPDATA%\Programs\MongoDB`).

```bash
npm install
cp .env.example .env
npm run db       # terminal 1: start local mongod
npm run seed     # optional: 10,000 devices + 100,000 latest readings (idempotent)
npm run dev      # terminal 2: http://localhost:3000
```

The simulator starts with the server (`src/instrumentation.ts`). The dashboard also works without MongoDB: it runs from memory and persistence re-attaches when the database comes up.

```bash
npm run typecheck && npm run lint && npm test
curl -N http://localhost:3000/api/stream     # watch the live SSE frames
```

## What you see

Everything cross-filters: clicking a KPI, donut slice, radar sensor, heatmap zone or 3D rack filters the table, alerts and 3D view together.

- **Top bar:** search (`/`), connection pill (LIVE / STALE / RECONNECTING, "updated Xs ago"), **⚙ Thresholds** editor, **◇ Data model** page, dark/light toggle (dark by default, remembered), clock. A banner with **Retry** appears when the stream drops for more than 3 s; data is dimmed, never blanked.
- **Filters:** status, floor, zone, breaching sensor, search; **saved views** (name, recall, delete; per browser).
- **KPI strip:** total, normal, warning, critical, offline and devices reporting per tick, with 60 s sparklines.
- **Industrial 3D Control Room:** 4 halls × 6 zones × 3 racks, one LED per device (all 10,000 in one three.js InstancedMesh). Rack strips show zone health; critical LEDs pulse. Hover to inspect, click a rack to filter, click an LED to open the device; drag to orbit, ctrl+scroll to zoom.
- **Live alerts + activity feed:** critical first, unacknowledged before acknowledged, newest first. **Ack** an alert and every open tab sees it within a second.
- **Fleet health** (3-minute trend), **status distribution** donut, **sensor breach radar**, **location health** heatmap (floor × zone) and **fleet averages** gauges.
- **Device table:** all 10,000 devices, virtualized. Sortable columns; the live order refreshes every 3 s and pauses while hovered or focused. Keyboard: arrows / Page / Home / End move, Enter opens. Breaching values are coloured; stale and offline rows are dimmed.
- **Device drawer:** 10 sensor tiles, a 5-minute time series with the live warning/critical bands, the event timeline from MongoDB. Focus is trapped; Esc closes and returns focus.
- **Alarm thresholds:** edit warning/critical bounds per sensor (validated inline). The server re-evaluates all 100,000 readings, alerts follow on the next tick, every tab updates live, and the rules persist in MongoDB.
- **`/model`:** live entity diagram (SensorType, Device, Reading, Sample, Alert, Event, Summary, Delta), where each lives, and real JSON samples from the running system.

## Architecture

```
Browser ── snapshot (REST, once + after reconnect) ──► Next.js route handlers (thin)
   ▲                                                        │
   └──── SSE /api/stream: summary · delta · alert, 1 Hz ◄── StreamHub (serialize once, fan out)
                                                            ▲
                         SimEngine (one ticker, 10k × 10) ──┤── bulkWrite every 5 s ──► MongoDB
                         in-memory state + history ring     │   devices · latest_readings · events
```

| API | Returns |
|---|---|
| `GET /api/devices` | list/search: `q, status, floor, zone, sensor, sort, dir, limit, cursor` |
| `GET /api/devices/{id}` | device, ten readings, open alert, recent events |
| `GET /api/devices/{id}/history` | time series: `sensor, window` (seconds) |
| `GET /api/telemetry/latest` | every device as a packed row (the client snapshot) |
| `GET /api/summary` | counts by status, sensor and zone, averages, top alerts |
| `GET /api/fleet` | columnar device metadata for the snapshot |
| `GET /api/stream` | SSE: `hello`, `summary`, `delta`, `alert` (raised / cleared / acked), `thresholds`, heartbeat |
| `POST /api/alerts/{id}/ack` | acknowledge an open alert; broadcast to every tab |
| `GET` / `PUT` / `DELETE /api/thresholds` | read, replace (validated) or reset the alarm rules; broadcast as an SSE `thresholds` frame |
| `GET /api/health` | uptime, tick, stream connections, MongoDB and flush status |

Design docs: [`docs/diagrams`](docs/diagrams) (HLD, architecture, wireframe — open in excalidraw.com), [`docs/design/style-directions.html`](docs/design/style-directions.html) (interactive prototype), [`CONTEXT.md`](CONTEXT.md) (domain vocabulary), [`docs/AI-LOG.md`](docs/AI-LOG.md).

## Key decisions

- **SSE over WebSocket:** traffic is one-way, EventSource reconnects on its own, plain HTTP.
- **One simulator + hub:** each tick is serialized once for all tabs; connections never own a timer.
- **Deltas, not full frames:** only devices that reported or changed status (~15% per tick).
- **No React state for 10k devices:** a `TelemetryStore` holds typed arrays; rows and panels subscribe via `useSyncExternalStore`, batched per animation frame.
- **Hot state in memory, MongoDB for persistence:** latest readings and events are flushed in bulk every 5 s.

## Scaling to 100k / 1M devices

Shard the simulator/ingest per site behind a queue (Kafka/NATS); keep per-zone aggregates server-side and stream only aggregates plus the operator's visible subset (subscription by viewport/filter); move history to a MongoDB time-series collection or a TSDB; use binary frames (e.g. MessagePack) and WebSocket fan-out behind a broker; render the matrix/3D views from GPU buffers; paginate/search the table server-side.

## Development notes

- After editing simulator code (`src/server/sim`), restart `npm run dev`: the running fleet is cached on `globalThis` so hot reload does not start a second simulator, which also means it keeps the old code until restart.
- To run a production build next to `next dev`: `NEXT_DIST_DIR=.next-verify npm run build && NEXT_DIST_DIR=.next-verify npx next start -p 3100`.
- Tests: 128 unit tests across the shared domain, simulator, stream hub, SSE response, routes, services, repos, client store and helpers (`npm test`).

## Known limitations

- History lives in memory (~5 min) and resets on restart; at scale it moves to a time-series store.
- On serverless hosts each instance runs its own simulator (same layout, independent values); the local run is the reference.
- UI components have no automated DOM tests; they were verified in the browser.
- Alarm rules are global (not per zone or per device) and there is no user/role model for who may edit them.
