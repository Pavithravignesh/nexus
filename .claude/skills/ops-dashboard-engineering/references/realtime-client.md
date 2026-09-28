# Client real-time pattern

## TelemetryStore (src/lib/telemetry-store.ts)

Plain class, one instance per page, outside React.

```ts
type Listener = () => void;

export class TelemetryStore {
  devices: DeviceMeta[] = [];               // index = deviceIdx, stable
  status = new Uint8Array(0);               // per device
  lastSeen = new Float64Array(0);
  values = new Float32Array(0);             // deviceIdx * 10 + sensorIdx
  summary: Summary | null = null;
  alerts: Alert[] = [];                     // newest first, capped 200
  version = 0;

  private rowListeners = new Map<number, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private dirty = new Set<number>();
  private raf = 0;

  applyDelta(rows: DeltaRow[]): void {
    for (const r of rows) { /* write typed arrays */ this.dirty.add(r[0]); }
    this.schedule();
  }
  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0; this.version++;
      for (const i of this.dirty) this.rowListeners.get(i)?.forEach((l) => l());
      this.dirty.clear();
      this.globalListeners.forEach((l) => l());
    });
  }
  subscribeRow(i: number, l: Listener): () => void { /* add/remove */ }
  subscribe(l: Listener): () => void { /* add/remove */ }
}
```

## Hooks

- `useDeviceRow(idx)` → `useSyncExternalStore(cb => store.subscribeRow(idx, cb), () => store.rowVersion(idx))`,
  then reads typed arrays. Only that row re-renders.
- `useSummary()` → global subscription, returns `store.summary` (replaced object per tick,
  so identity changes exactly once per tick).
- `useSortedIndex(filters, sort)` → recomputed on filter/sort change and at most every
  `RESORT_MS` (3 s) while live; paused while the pointer is over the table
  (show a "Live order paused" chip).

## Value-change flash

`DeviceRow` keeps the previous value in a ref; when it changes, set `data-flash="up|down"`
for 600 ms with a CSS transition. No React state per cell.

## Reconnect

On `reconnecting → live`, call `useSnapshot().reload()` once, replace store arrays, bump
version. Keep the old data visible (dimmed) until the new snapshot lands.
