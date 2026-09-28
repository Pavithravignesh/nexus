# SSE stream

## Design

- One simulator ticks the whole fleet every `TICK_MS` (1000). After each tick it emits
  `{ seq, summary, delta, alerts }` on the stream hub (`EventEmitter`, `setMaxListeners(0)`).
- Each SSE connection subscribes on open and unsubscribes on `request.signal` abort.
  Many tabs = many listeners, still one fleet.
- Frames are serialized **once per tick** by the hub and the same string is written to
  every connection (no per-connection JSON.stringify).

## Wire format

```
id: 1842
event: summary
data: {"ts":"2026-09-28T10:00:01.000Z","total":10000,"byStatus":{"NORMAL":9301,"WARNING":244,"CRITICAL":61,"OFFLINE":394},...}

id: 1842
event: delta
data: {"ts":"...","rows":[[17,1,1759053601000,22.4,48.1,612,20.8,31,18,40,1012,55,12], ...]}

id: 1842
event: alert
data: {"raised":[{"id":"...","deviceId":"DEV-00017","sensor":"co2","severity":"CRITICAL","value":1650,"ts":"..."}],"cleared":["..."]}

: hb
```

Status codes in `delta`: 0 NORMAL, 1 WARNING, 2 CRITICAL, 3 OFFLINE. Values follow the
order in `shared/sensors.ts`. `null` for a sensor that did not report.

## Handler skeleton

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const hub = getStreamHub();
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string): void => {
        try { controller.enqueue(enc.encode(chunk)); } catch { cleanup(); }
      };
      send(hub.helloFrame());
      const onFrame = (frame: string): void => send(frame);
      hub.on("frame", onFrame);
      const hb = setInterval(() => send(": hb\n\n"), 15_000);
      const cleanup = (): void => {
        hub.off("frame", onFrame);
        clearInterval(hb);
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

## Client connection states

`connecting` → `live` → (`reconnecting` after error, exponential backoff 1 s → 30 s with
jitter, manual retry button) → `live`. After 5 s without any frame, show `stale`. The
banner and ConnectionPill read this one state machine.

## Ways SSE silently breaks

| Symptom | Cause | Check |
|---|---|---|
| Connects, nothing arrives | compression/buffering | `curl -N localhost:3000/api/stream` |
| Two fleets / double speed | simulator started twice (hot reload) | singleton on `globalThis`, log engine start |
| Memory climbs | listeners not removed on abort | log hub listener count |
| UI freezes under load | setState per row / resort per tick | React Profiler, store notify counts |
| Dev: events arrive twice | StrictMode double effect | cleanup closes the first EventSource |
