import { afterEach, describe, expect, it } from "vitest";
import { SENSOR_COUNT, sensorIndex } from "@/shared/sensors";
import { CRITICAL, NORMAL, OFFLINE, WARNING } from "@/shared/status";
import { DEFAULT_THRESHOLDS, setThresholds } from "@/shared/thresholds";
import { SimEngine } from "./engine";

const T0 = Date.UTC(2026, 8, 28, 10);
const CO2 = sensorIndex("co2");

afterEach(() => setThresholds(DEFAULT_THRESHOLDS));

describe("SimEngine.applyThresholds", () => {
  it("re-derives every reading status, reporting or not", () => {
    const e = new SimEngine({ seed: 7, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 50 });
    e.state.values[3 * SENSOR_COUNT + CO2] = 900;
    e.state.readingStatus[3 * SENSOR_COUNT + CO2] = NORMAL;
    e.takeDirty();

    setThresholds({ ...DEFAULT_THRESHOLDS, co2: { hi: [800, 850] } });
    e.applyThresholds();

    expect(e.state.readingStatus[3 * SENSOR_COUNT + CO2]).toBe(CRITICAL);
    expect(e.takeDirty().idxs).toContain(3);
  });

  it("leaves device status and alerts to the next step", () => {
    const e = new SimEngine({ seed: 7, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 50 });
    const idx = e.state.devices.findIndex((d) => e.state.status[d.idx] === NORMAL);
    e.state.values[idx * SENSOR_COUNT + CO2] = 900;

    // Warning at 700 holds even if the device reports and its value decays toward baseline.
    setThresholds({ ...DEFAULT_THRESHOLDS, co2: { hi: [700, 1500] } });
    e.applyThresholds();
    expect(e.state.readingStatus[idx * SENSOR_COUNT + CO2]).toBe(WARNING);
    expect(e.state.status[idx]).toBe(NORMAL);

    const tick = e.step(T0 + 1000);
    expect(e.state.status[idx]).toBeGreaterThanOrEqual(WARNING);
    expect(e.state.status[idx]).not.toBe(OFFLINE);
    expect(tick.alerts.raised.some((a) => a.deviceIdx === idx)).toBe(true);
  });
});
