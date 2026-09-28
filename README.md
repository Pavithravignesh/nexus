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

- **Top bar:** search (`/`), connection pill (LIVE / STALE / RECONNECTING, "updated Xs ago"), clock. A banner with **Retry** appears when the stream drops; data is dimmed, never blanked.
- **KPI strip:** total, normal, warning, critical, offline, and devices reporting per tick, each with a 60 s sparkline. Click a status to filter everything.
- **Device table:** all 10,000 devices, virtualized. Sortable columns, filters for status, floor, zone and search. The live order refreshes every 3 s and pauses while you hover. Breaching values are coloured; stale and offline rows are dimmed.
- **Live alerts + activity feed:** critical first, then newest; click to open the device.
- **Device drawer:** 10 sensor tiles, a 5-minute time series with warning/critical bands and a live tail, and the event timeline from MongoDB.

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
| `GET /api/stream` | SSE: `hello`, `summary`, `delta`, `alert`, heartbeat |
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

## Known limitations

- The 3D control room and P1 charts (zone heatmap, incident trend, device matrix, breach radar) are in the prototype, not yet in the app.
- History lives in memory (~5 min) and resets on restart.
- Alerts cannot be acknowledged yet; thresholds are fixed in `src/shared/sensors.ts`.
