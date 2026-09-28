import { describe, expect, it } from "vitest";
import { ZONE_KEYS, zoneKey } from "@/shared/fleet";
import { alertFrameSchema, deltaFrameSchema, summarySchema } from "@/shared/schemas/stream.schema";
import { SENSOR_COUNT } from "@/shared/sensors";
import { NORMAL, OFFLINE } from "@/shared/status";
import { SimEngine } from "./engine";

const T0 = Date.UTC(2026, 8, 28, 10);
const make = (seed = 42): SimEngine => new SimEngine({ seed, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000 });
const run = (e: SimEngine, ticks: number): ReturnType<SimEngine["step"]>[] => Array.from({ length: ticks }, (_, k) => e.step(T0 + (k + 1) * 1000));

describe("SimEngine fleet", () => {
  const e = make();

  it("simulates 10,000 devices with 10 readings each", () => {
    expect(e.state.devices).toHaveLength(10_000);
    expect(e.state.values).toHaveLength(10_000 * SENSOR_COUNT);
    expect(new Set(e.state.devices.map((d) => d.deviceId)).size).toBe(10_000);
  });

  it("spreads devices over all 24 zones", () => {
    const zones = new Set(e.state.devices.map((d) => zoneKey(d.zone, d.floor)));
    expect([...zones].sort()).toEqual([...ZONE_KEYS].sort());
  });

  it("is deterministic for a seed", () => {
    const a = make(7);
    const b = make(7);
    expect(a.state.devices[123]).toEqual(b.state.devices[123]);
    expect(run(a, 3).at(-1)?.summary).toEqual(run(b, 3).at(-1)?.summary);
  });
});

describe("SimEngine ticks", () => {
  const e = make();
  const ticks = run(e, 60);

  it("reports roughly the change ratio of devices each tick", () => {
    for (const t of ticks.slice(10)) {
      expect(t.summary.reporting).toBeGreaterThan(500);
      expect(t.summary.reporting).toBeLessThan(3000);
    }
  });

  it("keeps a believable health mix", () => {
    const s = ticks.at(-1)!.summary.byStatus;
    expect(s.NORMAL / 10_000).toBeGreaterThan(0.9);
    expect(s.WARNING).toBeGreaterThan(50);
    expect(s.CRITICAL).toBeGreaterThan(5);
    expect(s.OFFLINE).toBeGreaterThan(50);
  });

  it("keeps exactly one open alert per non-normal device", () => {
    const alerts = e.alerts();
    const nonNormal = [...e.state.status].filter((s) => s !== NORMAL).length;
    expect(alerts).toHaveLength(nonNormal);
    for (const a of alerts) expect(e.state.status[a.deviceIdx]).not.toBe(NORMAL);
  });

  it("orders open alerts critical first", () => {
    const sev = e.alerts().map((a) => a.severity);
    expect(sev.indexOf("CRITICAL")).toBe(0);
    expect(sev.lastIndexOf("CRITICAL")).toBeLessThan(sev.indexOf("WARNING"));
  });

  it("emits frames that pass the wire schemas", () => {
    for (const t of ticks.slice(-5)) {
      expect(summarySchema.safeParse(t.summary).success).toBe(true);
      expect(deltaFrameSchema.safeParse(t.delta).success).toBe(true);
      expect(alertFrameSchema.safeParse(t.alerts).success).toBe(true);
    }
  });

  it("sends only changed devices in the delta, not the whole fleet", () => {
    const t = ticks.at(-1)!;
    expect(t.delta.rows.length).toBeGreaterThan(0);
    expect(t.delta.rows.length).toBeLessThan(4000);
    expect(t.delta.rows.length).toBeGreaterThanOrEqual(t.summary.reporting);
  });

  it("raises and clears alerts over time and records events for each transition", () => {
    const raised = ticks.reduce((a, t) => a + t.alerts.raised.length, 0);
    const cleared = ticks.reduce((a, t) => a + t.alerts.cleared.length, 0);
    const events = ticks.reduce((a, t) => a + t.events.length, 0);
    expect(raised).toBeGreaterThan(0);
    expect(cleared).toBeGreaterThan(0);
    expect(events).toBeGreaterThanOrEqual(raised);
  });

  it("hands dirty devices and events to persistence exactly once", () => {
    const first = e.takeDirty();
    expect(first.idxs.length).toBeGreaterThan(1000);
    expect(first.events.length).toBeGreaterThan(0);
    const second = e.takeDirty();
    expect(second.idxs).toHaveLength(0);
    expect(second.events).toHaveLength(0);
  });
});

describe("SimEngine offline handling", () => {
  it("is OFFLINE exactly when a device has been silent past the window, after every tick", () => {
    const e = make();
    let offlineEvents = 0;
    let onlineEvents = 0;
    for (let k = 1; k <= 45; k++) {
      const now = T0 + k * 1000;
      const t = e.step(now);
      offlineEvents += t.events.filter((ev) => ev.kind === "offline").length;
      onlineEvents += t.events.filter((ev) => ev.kind === "online").length;
      for (let i = 0; i < e.state.devices.length; i += 7) {
        const silent = now - (e.state.lastSeen[i] ?? 0) > 30_000;
        expect(e.state.status[i] === OFFLINE).toBe(silent);
      }
    }
    expect(offlineEvents).toBeGreaterThan(0);
    expect(onlineEvents).toBeGreaterThan(0);
  });
});

describe("SimEngine long run", () => {
  it("settles at a stable health mix instead of drifting offline", () => {
    const e = new SimEngine({ seed: 9, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 3000 });
    const shares: number[] = [];
    for (let k = 1; k <= 400; k++) {
      const s = e.step(T0 + k * 1000).summary.byStatus;
      if (k % 50 === 0) shares.push(s.OFFLINE / 3000);
    }
    for (const share of shares) expect(share).toBeLessThan(0.06);
    expect(e.summary.byStatus.NORMAL / 3000).toBeGreaterThan(0.9);
  });
});

describe("SimEngine history", () => {
  it("samples every sampleEveryMs and returns oldest-first series", () => {
    const e = new SimEngine({ seed: 1, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 50, sampleEveryMs: 2000, historyCapacity: 5 });
    for (let k = 1; k <= 20; k++) e.step(T0 + k * 1000);
    const s = e.history.series(3, 0);
    expect(s).toHaveLength(5);
    expect(s.map((p) => p.ts)).toEqual([12, 14, 16, 18, 20].map((sec) => T0 + sec * 1000));
    expect(e.history.series(3, 0, T0 + 17_000)).toHaveLength(2);
  });
});
