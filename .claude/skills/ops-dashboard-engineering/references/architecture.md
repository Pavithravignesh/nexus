# Folder layout

As built (tests sit next to the file they test as `*.test.ts`):

```
src/
  instrumentation.ts            register(): starts the runtime, attaches persistence (Node runtime only)
  app/
    layout.tsx, page.tsx        fonts, theme script (no-flash); the dashboard
    error.tsx                   error boundary with retry
    model/page.tsx              /model: live entity diagram
    api/                        thin route handlers: zod in, envelope out
      health · summary · fleet · telemetry/latest · events · thresholds
      devices · devices/[id] · devices/[id]/history · alerts/[id]/ack
      stream/route.ts           SSE, subscribes to the stream hub
  components/                   UI by feature
    shell/ kpi/ charts/ alerts/ devices/ drawer/ three/ insights/
    filters/ settings/ model/ ui/  status.tsx  Dashboard.tsx
  client/                       browser data layer
    useTelemetry.tsx            TelemetryProvider (snapshot, then EventSource), useTopic, useRow
    telemetry-store.ts          TelemetryStore: typed arrays outside React, topic/row notifications
    stream-stats.ts             live stream metrics for the connection pill
    api.ts, thresholds-api.ts   fetchJson() over the { ok, data } envelope
  hooks/                        UI-only hooks: useSavedViews, useFocusTrap
  lib/                          pure helpers: device-filters, list-filters, pagination
  server/
    runtime.ts                  composition root: one SimEngine + one StreamHub + 1 s tick + 5 s flush, on globalThis
    env.ts                      zod-validated env, the only process.env reader
    logger.ts                   pino
    errors.ts                   ApiError + handleRoute (envelope, request id, logging)
    sim/                        the world model: engine.ts (tick, state arrays, alerts, events),
                                fleet.ts (seeded layout), history.ts (ring buffer), random.ts (mulberry32)
    insights/anomaly.ts         online anomaly detector (Predictive insights)
    services/                   business logic over the engine: fleet, alerts, thresholds, events
    stream/                     stream-hub.ts (serialise once, fan out), sse-response.ts (one SSE connection)
    persistence/                persistence.ts (attach, flush, retry)
      repos/                    devices, readings, events, settings, event-query (cursor paging)
      db/                       client.ts, collections.ts, indexes.ts
  shared/                       contract for server and browser
    sensors.ts fleet.ts fleet-meta.ts status.ts thresholds.ts summarize.ts types.ts
    schemas/                    zod: stream frames (stream.schema.ts), API responses (api.schema.ts)
scripts/
  start-mongo.mjs               local mongod for development
  seed.ts                       idempotent: 10,000 devices + initial readings
  push.mjs                      push via `gh api` (npm run push / npm run status) where git.exe is blocked
  dev-office.mjs                npm run dev:office: dev server where native binaries are blocked
  office-preload.cjs            its WebAssembly shims for lightningcss and Tailwind oxide
```

# Layer contract

| Layer | Owns | Never does |
|---|---|---|
| `app/**` | parse input, call one service, map to response | business rules, Mongo |
| `server/runtime.ts` | wiring: engine + hub + timers, the persistence hooks | business rules |
| `server/services` | business logic: filtering, details, history slicing, ack, thresholds | import `next/*` |
| `server/sim` | the fleet state, the tick, generating values, alerts, events | HTTP, Mongo, timers |
| `server/stream` | SSE fan-out: serialise each tick once, one listener per connection | business rules |
| `server/persistence` | attach/flush/retry; repos do Mongo queries, bulkWrite, id mapping | return raw documents |
| `shared` | types, schemas, thresholds, pure derivations | Node-only imports |
| `client`, `components`, `hooks`, `lib` | client store, stream state, rendering, pure helpers | import `server/*` |

# Data model (MongoDB)

- `devices` (10,000): `{ _id: deviceId, name, type, site, floor, zone, room, rack, active }`.
  Indexes: `{ zone: 1, floor: 1 }`, text-ish prefix on `name`.
- `latest_readings` (100,000): `{ _id: "<deviceId>:<sensor>", deviceId, sensor, value, unit, status, ts, location }`.
  Upserted in batches of dirty keys every `FLUSH_INTERVAL_MS` (default 5 s).
- `events`: `{ _id, deviceId, sensor, kind: "raised"|"cleared"|"offline"|"online", severity, value, ts, ack }`,
  TTL index on `ts` (24 h).
- History: in-memory ring buffer per (device, sensor), 1 sample / 5 s for 15 min
  (`Float32Array`, ~72 MB for 100k series). At scale this moves to a Mongo time-series collection.
