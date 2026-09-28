import { describe, expect, it } from "vitest";
import { SimEngine } from "@/server/sim/engine";
import { SENSOR_COUNT, sensorIndex } from "@/shared/sensors";
import { CRITICAL } from "@/shared/status";
import type { Alert } from "@/shared/types";
import { TREND_CAPACITY, TelemetryStore } from "./telemetry-store";

const T0 = Date.UTC(2026, 8, 28, 10);

function setup(): { store: TelemetryStore; engine: SimEngine; pending: (() => void)[] } {
  const engine = new SimEngine({ seed: 4, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 300 });
  const pending: (() => void)[] = [];
  const store = new TelemetryStore((fn) => pending.push(fn), () => T0);
  store.applySnapshot({ devices: engine.state.devices, rows: engine.state.devices.map((d) => engine.deltaRow(d.idx)), seq: 0, summary: engine.summary, alerts: engine.alerts() });
  store.flush();
  return { store, engine, pending };
}

describe("TelemetryStore", () => {
  it("loads a snapshot into typed arrays and derives reading status", () => {
    const { store, engine } = setup();
    expect(store.devices).toHaveLength(300);
    expect(Array.from(store.status)).toEqual(Array.from(engine.state.status));
    expect(store.loaded).toBe(true);
    expect(store.alerts.length).toBe(engine.alerts().length);
  });

  it("notifies only the rows that changed, once per frame", () => {
    const { store, pending } = setup();
    let row5 = 0;
    let row6 = 0;
    let fleet = 0;
    store.subscribeRow(5, () => row5++);
    store.subscribeRow(6, () => row6++);
    store.subscribe("fleet", () => fleet++);
    const vals = [23, 46, 1600, 20.9, 28, 12, 24, 1013, 52, 8];
    store.applyDelta({ seq: 1, ts: new Date(T0).toISOString(), rows: [[5, 2, T0, ...vals]] });
    store.applyDelta({ seq: 2, ts: new Date(T0).toISOString(), rows: [[5, 2, T0, ...vals]] });
    expect(row5).toBe(0); // batched until the frame runs
    pending.splice(0).forEach((fn) => fn());
    expect(row5).toBe(1);
    expect(row6).toBe(0);
    expect(fleet).toBe(1);
    expect(store.readingStatus[5 * SENSOR_COUNT + sensorIndex("co2")]).toBe(CRITICAL);
    expect(store.rowVersion(5)).toBeGreaterThan(store.rowVersion(6));
  });

  it("keeps a capped health trend, one point per tick", () => {
    const { store, engine } = setup();
    for (let k = 1; k <= TREND_CAPACITY + 20; k++) store.applySummary(engine.step(T0 + k * 1000).summary);
    expect(store.trend).toHaveLength(TREND_CAPACITY);
    expect(store.trend.at(-1)?.t).toBe(T0 + (TREND_CAPACITY + 20) * 1000);
    store.applySummary(engine.summary);
    expect(store.trend).toHaveLength(TREND_CAPACITY);
  });

  it("adds raised alerts, removes cleared ones, keeps critical first, and feeds both", () => {
    const { store } = setup();
    const base = { deviceId: "DEV-00001", deviceIdx: 0, sensor: "co2" as const, value: 1200 };
    const warn: Alert = { ...base, id: "w", severity: "WARNING", raisedAt: new Date(T0 + 5000).toISOString() };
    const crit: Alert = { ...base, id: "c", severity: "CRITICAL", raisedAt: new Date(T0).toISOString() };
    store.applyAlerts({ seq: 1, raised: [warn, crit], cleared: [] });
    expect(store.alerts[0]?.severity).toBe("CRITICAL");
    store.applyAlerts({ seq: 2, raised: [], cleared: ["c"] });
    expect(store.alerts.find((a) => a.id === "c")).toBeUndefined();
    expect(store.feed.slice(0, 3).map((f) => f.kind)).toEqual(["cleared", "raised", "raised"]);
  });

  it("ignores deltas that arrive before the first snapshot", () => {
    const store = new TelemetryStore(() => {}, () => T0);
    store.applyDelta({ seq: 1, ts: new Date(T0).toISOString(), rows: [[0, 1, T0, ...Array(10).fill(1)]] });
    expect(store.status).toHaveLength(0);
  });

  it("reports connection changes once", () => {
    const { store } = setup();
    let n = 0;
    store.subscribe("connection", () => n++);
    store.setConnection("live");
    store.setConnection("live");
    store.flush();
    expect(n).toBe(1);
    expect(store.connection).toBe("live");
  });
});
