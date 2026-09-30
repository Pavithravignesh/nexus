import { describe, expect, it } from "vitest";
import { describeFilters, viewFiltersSchema } from "./useSavedViews";

const SENSORS = ["Temp", "Humidity", "CO2"];
const STATUS = ["NORMAL", "WARNING", "CRITICAL", "OFFLINE"];
const none = { q: "", status: null, zone: null, floor: null, sensor: null, type: null, stale: false };

describe("saved view filters", () => {
  it("accepts a full filter set and rejects unknown zones or floors", () => {
    expect(viewFiltersSchema.safeParse({ q: "dev", status: 2, zone: "C", floor: 2, sensor: 2 }).success).toBe(true);
    expect(viewFiltersSchema.safeParse({ ...none, zone: "Z" }).success).toBe(false);
    expect(viewFiltersSchema.safeParse({ ...none, floor: 9 }).success).toBe(false);
    expect(viewFiltersSchema.safeParse({ ...none, status: 7 }).success).toBe(false);
  });

  it("loads views saved before type/stale existed", () => {
    const legacy = { q: "", status: 2, zone: null, floor: null, sensor: null };
    expect(viewFiltersSchema.parse(legacy)).toMatchObject({ type: null, stale: false });
  });

  it("describes a view in a few words", () => {
    expect(describeFilters(none, SENSORS, STATUS)).toBe("all devices");
    expect(describeFilters({ ...none, q: "rack", status: 2, zone: "C", floor: 2, sensor: 2 }, SENSORS, STATUS)).toBe('CRITICAL · C2 · CO2 · "rack"');
    expect(describeFilters({ ...none, type: "RackMonitor", stale: true }, SENSORS, STATUS)).toBe("RackMonitor · stale");
    expect(describeFilters({ ...none, floor: 3 }, SENSORS, STATUS)).toBe("*3");
  });
});
