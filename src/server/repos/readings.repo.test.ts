import { describe, expect, it } from "vitest";
import { SENSOR_COUNT, sensorIndex } from "@/shared/sensors";
import { CRITICAL } from "@/shared/status";
import { SimEngine } from "../sim/engine";
import { readingDocs } from "./readings.repo";

describe("readingDocs", () => {
  const e = new SimEngine({ seed: 5, nowMs: Date.UTC(2026, 8, 28, 10), changeRatio: 0.1, offlineAfterMs: 30_000, size: 20 });
  const co2 = sensorIndex("co2");
  e.state.values[3 * SENSOR_COUNT + co2] = 1650.4;
  e.state.readingStatus[3 * SENSOR_COUNT + co2] = CRITICAL;
  const docs = readingDocs(e.state, 3);
  const d = e.state.devices[3]!;

  it("builds one document per sensor keyed deviceId:sensor", () => {
    expect(docs).toHaveLength(SENSOR_COUNT);
    expect(new Set(docs.map((x) => x._id)).size).toBe(SENSOR_COUNT);
    expect(docs[co2]?._id).toBe(`${d.deviceId}:co2`);
  });

  it("stores rounded values, units, status names and the zone key", () => {
    expect(docs[co2]).toMatchObject({ deviceId: d.deviceId, sensor: "co2", value: 1650, unit: "ppm", status: "CRITICAL", location: `${d.zone}${d.floor}` });
    expect(docs[co2]?.ts).toBeInstanceOf(Date);
  });

  it("returns nothing for an index outside the fleet", () => {
    expect(readingDocs(e.state, 99)).toEqual([]);
  });
});
