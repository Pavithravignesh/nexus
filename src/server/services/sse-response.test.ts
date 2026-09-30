import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamHub } from "@/server/services/stream-hub";
import { SimEngine } from "@/server/sim/engine";
import { streamResponse } from "@/server/services/sse-response";

const T0 = Date.UTC(2026, 8, 28, 10);
const decoder = new TextDecoder();

async function readSome(res: Response, parts: number): Promise<string> {
  const reader = res.body!.getReader();
  let out = "";
  for (let k = 0; k < parts; k++) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  reader.releaseLock();
  return out;
}

describe("GET /api/stream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("responds as an unbuffered event stream", () => {
    const res = streamResponse(new StreamHub(1000), new AbortController().signal);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  it("sends retry + hello first, then every published tick", async () => {
    const hub = new StreamHub(1000);
    const engine = new SimEngine({ seed: 2, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 200 });
    const res = streamResponse(hub, new AbortController().signal, () => T0);
    const first = await readSome(res, 1);
    expect(first.startsWith("retry: 2000\n\n")).toBe(true);
    expect(first).toContain("event: hello\n");
    hub.publish(engine.step(T0 + 1000));
    const next = await readSome(res, 1);
    expect(next).toContain("event: summary\n");
    expect(next).toContain("event: delta\n");
  });

  it("writes a heartbeat comment every 15 s", async () => {
    vi.useFakeTimers();
    const res = streamResponse(new StreamHub(1000), new AbortController().signal, () => T0);
    await readSome(res, 1);
    vi.advanceTimersByTime(15_000);
    expect(await readSome(res, 1)).toBe(": hb\n\n");
  });

  it("unsubscribes from the hub when the client disconnects", async () => {
    const hub = new StreamHub(1000);
    const ac = new AbortController();
    const res = streamResponse(hub, ac.signal, () => T0);
    await readSome(res, 1);
    expect(hub.connections).toBe(1);
    ac.abort();
    expect(hub.connections).toBe(0);
  });
});
