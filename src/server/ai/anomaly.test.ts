import { describe, expect, it } from "vitest";
import { insightFrameSchema } from "@/shared/schemas/stream.schema";
import { SENSOR_COUNT, sensorIndex } from "@/shared/sensors";
import { NORMAL, WARNING, readingStatus } from "@/shared/status";
import type { DeviceMeta, FleetState } from "@/shared/types";
import { SimEngine } from "../sim/engine";
import { createRng } from "../sim/random";
import { AnomalyDetector } from "./anomaly";

const T0 = Date.UTC(2026, 9, 12, 9);
const TEMP = sensorIndex("temperature");
const O2 = sensorIndex("o2");

/** A one-device fleet with every reading at `values`. */
function fleet(values: number[]): FleetState {
  const devices = [{ idx: 0, deviceId: "DEV-00000" } as DeviceMeta];
  const state: FleetState = { devices, status: new Uint8Array(1), readingStatus: new Uint8Array(SENSOR_COUNT), values: new Float32Array(SENSOR_COUNT), lastSeen: new Float64Array(1) };
  set(state, values);
  return state;
}

function set(state: FleetState, values: number[]): void {
  values.forEach((v, j) => {
    state.values[j] = v;
    state.readingStatus[j] = readingStatus(j, v);
  });
}

/** Feed one sensor a series (one reading every 5 s) and return the scan after the last one. */
function feed(series: number[], j = TEMP): ReturnType<AnomalyDetector["scan"]> & { state: FleetState } {
  const d = new AnomalyDetector(SENSOR_COUNT);
  const base = [23, 46, 650, 20.9, 28, 12, 24, 1013, 52, 8];
  const state = fleet(base);
  let out = d.scan(state, T0, 10);
  series.forEach((v, k) => {
    const now = T0 + k * 5000;
    const vals = [...base];
    vals[j] = v;
    set(state, vals);
    d.observe(j, v, now);
    out = d.scan(state, now, 10);
  });
  return { ...out, state };
}

const rng = createRng(1);
const noisy = (centre: number, sd: number, n: number): number[] => Array.from({ length: n }, () => centre + rng.gauss() * sd);

describe("AnomalyDetector", () => {
  it("stays quiet on steady noise", () => {
    expect(feed(noisy(23, 0.3, 200)).flagged).toBe(0);
  });

  it("does not flag before warm-up", () => {
    expect(feed([23, 23, 23, 29.5]).flagged).toBe(0);
  });

  it("flags a step far from normal that is still inside the alarm bounds", () => {
    const { items } = feed([...noisy(23, 0.3, 40), 28.5]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sensor: "temperature", value: 28.5 });
    expect(items[0]?.z).toBeGreaterThan(4);
  });

  it("forecasts the breach of a slow drift before the threshold alert fires", () => {
    // 23 °C creeping up 0.4 °C per reading (every 5 s); the warning bound is 30 °C.
    const drift = Array.from({ length: 12 }, (_, k) => 24 + k * 0.4);
    const { items, state } = feed([...noisy(23, 0.25, 40), ...drift]);
    expect(state.readingStatus[TEMP]).toBe(NORMAL);
    const hit = items[0];
    expect(hit?.sensor).toBe("temperature");
    expect(hit?.trendPerMin).toBeGreaterThan(2);
    // last value 28.4 at ~+4.8 °C/min: about 20 s to go
    expect(hit?.etaSec).toBeGreaterThan(5);
    expect(hit?.etaSec).toBeLessThan(60);
  });

  it("leaves readings that already breach to the threshold alerts", () => {
    const { flagged, state } = feed([...noisy(23, 0.3, 40), 31]);
    expect(state.readingStatus[TEMP]).toBe(WARNING);
    expect(flagged).toBe(0);
  });

  it("ignores deviations away from the alarm bound", () => {
    // Temperature only has a high bound, so a drop is not on course to alarm.
    expect(feed([...noisy(23, 0.3, 40), 17]).flagged).toBe(0);
  });

  it("watches low bounds too", () => {
    const drift = Array.from({ length: 10 }, (_, k) => 20.8 - k * 0.1);
    const { items } = feed([...noisy(20.9, 0.03, 40), ...drift], O2);
    expect(items[0]?.sensor).toBe("o2");
    expect(items[0]?.etaSec).not.toBeNull();
  });

  it("keeps the first-flagged time while a reading stays flagged", () => {
    const d = new AnomalyDetector(SENSOR_COUNT);
    const state = fleet([23, 46, 650, 20.9, 28, 12, 24, 1013, 52, 8]);
    for (let k = 0; k < 30; k++) d.observe(TEMP, 23, T0 + k * 5000);
    state.values[TEMP] = 28;
    d.observe(TEMP, 28, T0 + 150_000);
    const first = d.scan(state, T0 + 150_000, 5).items[0];
    const later = d.scan(state, T0 + 155_000, 5).items[0];
    expect(first?.since).toBe(new Date(T0 + 150_000).toISOString());
    expect(later?.since).toBe(first?.since);
  });
});

describe("AnomalyDetector in the simulator", () => {
  it("emits valid insight frames and catches slow faults ahead of their alerts", () => {
    const e = new SimEngine({ seed: 11, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 3000 });
    const forecasts = new Set<string>();
    let lastFrame;
    for (let k = 1; k <= 300; k++) {
      const t = e.step(T0 + k * 1000);
      lastFrame = t.insights;
      for (const x of t.insights.items) if (x.etaSec !== null) forecasts.add(`${x.deviceIdx}:${x.sensor}`);
    }
    expect(insightFrameSchema.safeParse(lastFrame).success).toBe(true);
    expect(forecasts.size).toBeGreaterThan(0);
    // The watch list is a short early-warning list, not a second alarm flood.
    expect(lastFrame?.flagged).toBeLessThan(150);
  });
});
