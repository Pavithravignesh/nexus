import { describe, expect, it } from "vitest";
import { summarySchema } from "./schemas/stream.schema";
import { SENSOR_COUNT, sensorIndex } from "./sensors";
import { CRITICAL, NORMAL, OFFLINE, WARNING } from "./status";
import { summarize } from "./summarize";
import type { DeviceMeta, FleetState } from "./types";

function fleet(specs: { zone: DeviceMeta["zone"]; floor: DeviceMeta["floor"]; status: number; temp: number }[]): FleetState {
  const n = specs.length;
  const state: FleetState = {
    devices: specs.map((s, idx) => ({ idx, deviceId: `DEV-${idx}`, name: "", type: "EnvProbe v3", site: "DC-1", floor: s.floor, zone: s.zone, room: "", rack: "", active: true })),
    status: new Uint8Array(n),
    readingStatus: new Uint8Array(n * SENSOR_COUNT),
    values: new Float32Array(n * SENSOR_COUNT),
    lastSeen: new Float64Array(n),
  };
  specs.forEach((s, i) => {
    state.status[i] = s.status;
    state.values[i * SENSOR_COUNT + sensorIndex("temperature")] = s.temp;
  });
  return state;
}

describe("summarize", () => {
  const state = fleet([
    { zone: "A", floor: 1, status: NORMAL, temp: 20 },
    { zone: "A", floor: 1, status: WARNING, temp: 30 },
    { zone: "C", floor: 2, status: CRITICAL, temp: 40 },
    { zone: "C", floor: 2, status: OFFLINE, temp: 99 },
  ]);
  state.readingStatus[1 * SENSOR_COUNT + sensorIndex("temperature")] = WARNING;
  state.readingStatus[2 * SENSOR_COUNT + sensorIndex("co2")] = CRITICAL;
  // An offline device's last readings must not count as live breaches.
  state.readingStatus[3 * SENSOR_COUNT + sensorIndex("co2")] = CRITICAL;

  const s = summarize(state, { seq: 7, nowMs: Date.UTC(2026, 8, 28, 10), reporting: 2 });

  it("counts devices per status", () => {
    expect(s.byStatus).toEqual({ NORMAL: 1, WARNING: 1, CRITICAL: 1, OFFLINE: 1 });
    expect(s.total).toBe(4);
  });

  it("counts breaches per sensor from online devices only", () => {
    expect(s.bySensor.temperature).toEqual({ warning: 1, critical: 0 });
    expect(s.bySensor.co2).toEqual({ warning: 0, critical: 1 });
  });

  it("counts every zone, including empty ones", () => {
    expect(s.byZone.A1).toEqual([1, 1, 0, 0]);
    expect(s.byZone.C2).toEqual([0, 0, 1, 1]);
    expect(s.byZone.F4).toEqual([0, 0, 0, 0]);
    expect(Object.keys(s.byZone)).toHaveLength(24);
  });

  it("averages over online devices only", () => {
    expect(s.averages.temperature).toBe(30);
  });

  it("produces a frame that passes the wire schema", () => {
    expect(summarySchema.safeParse(s).success).toBe(true);
    expect(s.seq).toBe(7);
    expect(s.reporting).toBe(2);
    expect(s.ts).toBe("2026-09-28T10:00:00.000Z");
  });

  it("handles a fully offline fleet without dividing by zero", () => {
    const off = fleet([{ zone: "B", floor: 3, status: OFFLINE, temp: 50 }]);
    expect(summarize(off, { seq: 1, nowMs: 0, reporting: 0 }).averages).toEqual({ temperature: 0, humidity: 0, co2: 0 });
  });
});
