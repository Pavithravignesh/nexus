import { afterEach, describe, expect, it } from "vitest";
import { SimEngine } from "@/server/sim/engine";
import { SENSOR_COUNT, sensorIndex } from "@/shared/sensors";
import { CRITICAL, NORMAL } from "@/shared/status";
import { DEFAULT_THRESHOLDS, setThresholds } from "@/shared/thresholds";
import { TelemetryStore } from "./telemetry-store";

const T0 = Date.UTC(2026, 8, 28, 10);
const CO2 = sensorIndex("co2");

afterEach(() => setThresholds(DEFAULT_THRESHOLDS));

describe("TelemetryStore.rederive", () => {
  it("recomputes reading statuses with the active thresholds and notifies once", () => {
    const engine = new SimEngine({ seed: 4, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 30 });
    const pending: (() => void)[] = [];
    const store = new TelemetryStore((fn) => pending.push(fn), () => T0);
    store.applySnapshot({ devices: engine.state.devices, rows: engine.state.devices.map((d) => engine.deltaRow(d.idx)), seq: 0, summary: engine.summary, alerts: engine.alerts() });
    pending.splice(0).forEach((fn) => fn());
    store.values[2 * SENSOR_COUNT + CO2] = 700;
    store.readingStatus[2 * SENSOR_COUNT + CO2] = NORMAL;

    const seen = { fleet: 0, summary: 0, row2: 0 };
    store.subscribe("fleet", () => seen.fleet++);
    store.subscribe("summary", () => seen.summary++);
    store.subscribeRow(2, () => seen.row2++);
    const before = store.rowVersion(2);

    setThresholds({ ...DEFAULT_THRESHOLDS, co2: { hi: [500, 650] } });
    store.rederive();
    pending.splice(0).forEach((fn) => fn());

    expect(store.readingStatus[2 * SENSOR_COUNT + CO2]).toBe(CRITICAL);
    expect(store.rowVersion(2)).toBeGreaterThan(before);
    expect(seen).toEqual({ fleet: 1, summary: 1, row2: 1 });
  });
});
