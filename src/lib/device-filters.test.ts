import { describe, expect, it } from "vitest";
import { SimEngine } from "@/server/sim/engine";
import { SENSOR_COUNT } from "@/shared/sensors";
import { CRITICAL, NORMAL, OFFLINE, WARNING } from "@/shared/status";
import { EMPTY_FILTERS, filtersKey, isFiltered, matchesDevice, type DeviceFilters } from "./device-filters";

const T0 = Date.UTC(2026, 8, 30, 10);
const STALE = 10_000;
const e = new SimEngine({ seed: 21, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 400 });
const src = e.state;
const f = (patch: Partial<DeviceFilters>): DeviceFilters => ({ ...EMPTY_FILTERS, ...patch });
const all = (filters: DeviceFilters, now = T0): number[] => src.devices.map((d) => d.idx).filter((i) => matchesDevice(src, filters, i, now, STALE));

describe("matchesDevice", () => {
  it("matches everything with no filters", () => {
    expect(all(EMPTY_FILTERS)).toHaveLength(400);
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
  });

  it("filters by status, location and device type together", () => {
    const d = src.devices[7]!;
    const hits = all(f({ zone: d.zone, floor: d.floor, type: d.type }));
    expect(hits).toContain(7);
    expect(hits.every((i) => src.devices[i]!.zone === d.zone && src.devices[i]!.floor === d.floor && src.devices[i]!.type === d.type)).toBe(true);
    src.status[7] = WARNING;
    expect(all(f({ status: WARNING }))).toContain(7);
    expect(all(f({ status: CRITICAL }))).not.toContain(7);
  });

  it("filters to devices breaching a sensor, never offline ones", () => {
    src.status[3] = NORMAL;
    src.readingStatus[3 * SENSOR_COUNT + 2] = CRITICAL;
    src.status[4] = OFFLINE;
    src.readingStatus[4 * SENSOR_COUNT + 2] = CRITICAL;
    const hits = all(f({ sensor: 2 }));
    expect(hits).toContain(3);
    expect(hits).not.toContain(4);
  });

  it("finds stale devices only between the stale and offline windows", () => {
    src.status[10] = NORMAL;
    src.lastSeen[10] = T0 - 15_000;
    src.status[11] = NORMAL;
    src.lastSeen[11] = T0 - 2_000;
    const hits = all(f({ stale: true }));
    expect(hits).toContain(10);
    expect(hits).not.toContain(11);
  });

  it("searches id, name, zone key, rack and room case-insensitively", () => {
    const d = src.devices[42]!;
    expect(all(f({ q: d.deviceId.toLowerCase() }))).toEqual([42]);
    expect(all(f({ q: d.rack }))).toContain(42);
    expect(all(f({ q: `  ${d.zone}${d.floor} ` }))).toContain(42);
    expect(all(f({ q: `room ${d.room}` }))).toContain(42);
    expect(all(f({ q: "no-such-device" }))).toEqual([]);
  });
});

describe("filtersKey", () => {
  it("changes with every filter and ignores search case and padding", () => {
    expect(filtersKey(f({ q: " DEV-1 " }))).toBe(filtersKey(f({ q: "dev-1" })));
    expect(filtersKey(f({ stale: true }))).not.toBe(filtersKey(EMPTY_FILTERS));
    expect(filtersKey(f({ type: "RackMonitor" }))).not.toBe(filtersKey(EMPTY_FILTERS));
  });
});
