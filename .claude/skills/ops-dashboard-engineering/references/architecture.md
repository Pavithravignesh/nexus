# Folder layout

```
src/
  instrumentation.ts            register(): starts the simulator singleton (Node runtime only)
  app/
    layout.tsx                  fonts, theme script (no-flash), providers
    page.tsx                    the dashboard (client shell composes panels)
    error.tsx                   error boundary with retry
    api/
      health/route.ts
      summary/route.ts
      devices/route.ts          list/search/filter, ?q=&status=&zone=&floor=&sensor=&limit=&cursor=
      devices/[id]/route.ts
      devices/[id]/history/route.ts
      telemetry/latest/route.ts
      stream/route.ts           SSE, subscribes to the stream hub
  components/
    shell/                      TopBar, ConnectionPill, ThemeToggle, DisconnectedBanner
    kpi/                        KpiStrip, KpiCard (+ sparkline)
    charts/                     common.ts, FleetHealthArea, StatusDonut, ZoneHeatmap,
                                SensorBreachBars, TimeSeriesChart, Sparkline
    alerts/                     AlertsPanel, AlertItem, ActivityFeed
    devices/                    DeviceTable (virtual), DeviceRow, FilterBar, StatusBadge
    drawer/                     DeviceDrawer, SensorTile, DeviceTimeline
    ui/                         Skeleton, EmptyState, ErrorState, Kbd, Tooltip
  hooks/
    useSnapshot.ts              initial + post-reconnect load into the store
    useLiveStream.ts            owns EventSource, connection state, backoff
    useTelemetry.ts             useSyncExternalStore selectors over the store
    useResizeObserver.ts
  lib/
    api.ts                      fetchJson<T>() for the envelope
    telemetry-store.ts          TelemetryStore class (client)
  server/
    env.ts                      zod-validated env, the only process.env reader
    logger.ts                   pino
    errors.ts                   ApiError + handleRoute
    db/ client.ts collections.ts indexes.ts
    repos/ devices.repo.ts readings.repo.ts events.repo.ts
    sim/
      engine.ts                 singleton: tick loop, state arrays, ring buffers
      generators.ts             per-sensor random walk + anomaly episodes + offline flaps
      fleet.ts                  builds 10,000 device definitions deterministically (seeded)
    services/
      summary.service.ts devices.service.ts history.service.ts stream-hub.ts
  shared/
    sensors.ts                  sensor catalogue: key, label, unit, decimals, thresholds
    status.ts                   deriveReadingStatus, deriveDeviceStatus (pure, tested)
    summarize.ts                summary aggregation (pure, tested)
    types.ts
    schemas/                    zod: device, reading, summary, delta, alert, api envelope
scripts/
  start-mongo.mjs               reuse from try_cladue
  seed.ts                       idempotent: 10,000 devices + initial readings
```

# Layer contract

| Layer | Owns | Never does |
|---|---|---|
| `app/**` | parse input, call one service, map to response | business rules, Mongo |
| `server/services` | composition, filtering, history slicing, fan-out | import `next/*` |
| `server/sim` | the fleet state, the tick, generating values | HTTP, Mongo query syntax |
| `server/repos` | Mongo queries, bulkWrite, id mapping | return raw documents |
| `shared` | types, schemas, thresholds, pure derivations | Node-only imports |
| `components`, `hooks`, `lib` | rendering, stream state, client store | import `server/*` |

# Data model (MongoDB)

- `devices` (10,000): `{ _id: deviceId, name, type, site, floor, zone, room, rack, active }`.
  Indexes: `{ zone: 1, floor: 1 }`, text-ish prefix on `name`.
- `latest_readings` (100,000): `{ _id: "<deviceId>:<sensor>", deviceId, sensor, value, unit, status, ts, location }`.
  Upserted in batches of dirty keys every `FLUSH_INTERVAL_MS` (default 5 s).
- `events`: `{ _id, deviceId, sensor, kind: "raised"|"cleared"|"offline"|"online", severity, value, ts, ack }`,
  TTL index on `ts` (24 h).
- History: in-memory ring buffer per (device, sensor), 1 sample / 5 s for 15 min
  (`Float32Array`, ~72 MB for 100k series). At scale this moves to a Mongo time-series collection.
