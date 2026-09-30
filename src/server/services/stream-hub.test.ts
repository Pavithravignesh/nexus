import { describe, expect, it } from "vitest";
import { SimEngine } from "../sim/engine";
import { StreamHub, encodeFrame } from "./stream-hub";

const T0 = Date.UTC(2026, 8, 28, 10);

describe("encodeFrame", () => {
  it("writes id, event and one data line terminated by a blank line", () => {
    expect(encodeFrame("hello", 3, { a: 1 })).toBe('id: 3\nevent: hello\ndata: {"a":1}\n\n');
  });
});

describe("StreamHub", () => {
  const engine = new SimEngine({ seed: 3, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 500 });

  it("writes the same serialized chunk to every subscriber", () => {
    const hub = new StreamHub(1000);
    const a: string[] = [];
    const b: string[] = [];
    hub.subscribe((c) => a.push(c));
    hub.subscribe((c) => b.push(c));
    const chunk = hub.publish(engine.step(T0 + 1000));
    expect(a).toEqual([chunk]);
    expect(b[0]).toBe(a[0]);
    expect(chunk).toContain("event: summary\n");
    expect(chunk).toContain("event: delta\n");
  });

  it("stops writing after unsubscribe and tracks connections", () => {
    const hub = new StreamHub(1000);
    const got: string[] = [];
    const off = hub.subscribe((c) => got.push(c));
    expect(hub.connections).toBe(1);
    off();
    expect(hub.connections).toBe(0);
    hub.publish(engine.step(T0 + 2000));
    expect(got).toHaveLength(0);
  });

  it("only includes an alert frame when alerts changed", () => {
    const hub = new StreamHub(1000);
    const t = engine.step(T0 + 3000);
    const chunk = hub.publish({ ...t, alerts: { seq: t.seq, raised: [], cleared: [], acked: [] } });
    expect(chunk).not.toContain("event: alert");
  });

  it("publishes an ack immediately as an alert frame at the current seq", () => {
    const hub = new StreamHub(1000);
    const t = engine.step(T0 + 3500);
    hub.publish(t);
    const got: string[] = [];
    hub.subscribe((c) => got.push(c));
    const ackedAt = new Date(T0 + 3600).toISOString();
    const chunk = hub.publishAck([{ id: "ALR-x", ackedAt }]);
    expect(got).toEqual([chunk]);
    expect(chunk).toBe(encodeFrame("alert", t.seq, { seq: t.seq, raised: [], cleared: [], acked: [{ id: "ALR-x", ackedAt }] }));
  });

  it("greets new connections with the latest seq and tick length", () => {
    const hub = new StreamHub(1000);
    const t = engine.step(T0 + 4000);
    hub.publish(t);
    const hello = hub.hello(T0 + 4000);
    expect(hello).toContain(`id: ${t.seq}\nevent: hello\n`);
    expect(hello).toContain('"tickMs":1000');
    expect(hello).toContain('"staleAfterMs":10000,"offlineAfterMs":30000');
  });

  it("stamps each summary with the live connection count", () => {
    const hub = new StreamHub(1000, { staleAfterMs: 5000, offlineAfterMs: 20000 });
    hub.subscribe(() => {});
    hub.subscribe(() => {});
    const chunk = hub.publish(engine.step(T0 + 5000));
    expect(chunk).toContain('"clients":2');
    expect(hub.hello(T0)).toContain('"staleAfterMs":5000,"offlineAfterMs":20000');
  });
});
