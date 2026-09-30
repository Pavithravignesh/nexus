import { afterEach, describe, expect, it } from "vitest";
import { SENSOR_COUNT, sensorIndex } from "./sensors";
import { CRITICAL, NORMAL, OFFLINE, WARNING, deviceStatus, isStale, readingStatus, worstSensor, zoneStatus } from "./status";
import { DEFAULT_THRESHOLDS, setThresholds } from "./thresholds";

const T = sensorIndex("temperature");
const O2 = sensorIndex("o2");
const P = sensorIndex("pressure");

describe("readingStatus", () => {
  it("flags high-side sensors at or above each bound", () => {
    expect(readingStatus(T, 29.9)).toBe(NORMAL);
    expect(readingStatus(T, 30)).toBe(WARNING);
    expect(readingStatus(T, 34.9)).toBe(WARNING);
    expect(readingStatus(T, 35)).toBe(CRITICAL);
  });

  it("flags low-side sensors at or below each bound", () => {
    expect(readingStatus(O2, 20.9)).toBe(NORMAL);
    expect(readingStatus(O2, 19.5)).toBe(WARNING);
    expect(readingStatus(O2, 18.5)).toBe(CRITICAL);
  });

  it("checks both sides for two-sided sensors", () => {
    expect(readingStatus(P, 1013)).toBe(NORMAL);
    expect(readingStatus(P, 984)).toBe(WARNING);
    expect(readingStatus(P, 1041)).toBe(WARNING);
    expect(readingStatus(P, 969)).toBe(CRITICAL);
    expect(readingStatus(P, 1060)).toBe(CRITICAL);
  });

  describe("with custom thresholds", () => {
    afterEach(() => setThresholds(DEFAULT_THRESHOLDS));

    it("uses the active bounds instead of the catalogue defaults", () => {
      setThresholds({ ...DEFAULT_THRESHOLDS, temperature: { hi: [25, 28] }, o2: { lo: [20.5, 20] } });
      expect(readingStatus(T, 24.9)).toBe(NORMAL);
      expect(readingStatus(T, 25)).toBe(WARNING);
      expect(readingStatus(T, 28)).toBe(CRITICAL);
      expect(readingStatus(O2, 20.5)).toBe(WARNING);
      expect(readingStatus(O2, 20)).toBe(CRITICAL);
    });

    it("leaves sensors that were not edited on their defaults", () => {
      setThresholds({ ...DEFAULT_THRESHOLDS, temperature: { hi: [25, 28] } });
      expect(readingStatus(P, 984)).toBe(WARNING);
      expect(readingStatus(P, 1013)).toBe(NORMAL);
    });
  });
});

describe("deviceStatus", () => {
  const readings = new Uint8Array(SENSOR_COUNT * 2);
  readings[SENSOR_COUNT + 3] = WARNING;
  readings[SENSOR_COUNT + 7] = CRITICAL;

  it("is the worst reading status of that device only", () => {
    expect(deviceStatus(readings, 0, 1000, 1000, 30_000)).toBe(NORMAL);
    expect(deviceStatus(readings, 1, 1000, 1000, 30_000)).toBe(CRITICAL);
  });

  it("is OFFLINE once silent longer than the offline window, whatever the readings", () => {
    expect(deviceStatus(readings, 1, 0, 30_000, 30_000)).toBe(CRITICAL);
    expect(deviceStatus(readings, 1, 0, 30_001, 30_000)).toBe(OFFLINE);
  });

  it("reports which sensor is worst", () => {
    expect(worstSensor(readings, 1)).toBe(7);
    expect(worstSensor(readings, 0)).toBe(0);
  });
});

describe("isStale", () => {
  it("is true only between the stale and offline windows", () => {
    expect(isStale(0, 10_000, 10_000, 30_000)).toBe(false);
    expect(isStale(0, 10_001, 10_000, 30_000)).toBe(true);
    expect(isStale(0, 30_001, 10_000, 30_000)).toBe(false);
  });
});

describe("zoneStatus", () => {
  it("is NORMAL for an empty or quiet zone", () => {
    expect(zoneStatus([0, 0, 0, 0])).toBe(NORMAL);
    expect(zoneStatus([400, 10, 2, 5])).toBe(NORMAL);
  });

  it("escalates on the share of affected devices", () => {
    expect(zoneStatus([400, 16, 0, 0])).toBe(WARNING);
    expect(zoneStatus([400, 0, 5, 0])).toBe(CRITICAL);
    expect(zoneStatus([400, 0, 0, 14])).toBe(OFFLINE);
  });

  it("ranks critical above warning above offline", () => {
    expect(zoneStatus([380, 20, 6, 30])).toBe(CRITICAL);
    expect(zoneStatus([380, 20, 0, 30])).toBe(WARNING);
  });
});
