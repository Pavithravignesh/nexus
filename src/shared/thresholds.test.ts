import { afterEach, describe, expect, it } from "vitest";
import { SENSORS, sensorIndex } from "./sensors";
import { DEFAULT_THRESHOLDS, boundsFor, getThresholds, setThresholds, sidesOf, thresholdsSchema, type Thresholds } from "./thresholds";

const withSensor = (key: keyof Thresholds, bounds: Thresholds[keyof Thresholds]): unknown => ({ ...DEFAULT_THRESHOLDS, [key]: bounds });
const issuePaths = (input: unknown): string[] => {
  const r = thresholdsSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

afterEach(() => setThresholds(DEFAULT_THRESHOLDS));

describe("DEFAULT_THRESHOLDS", () => {
  it("mirrors the sensor catalogue bounds", () => {
    for (const s of SENSORS) {
      expect(DEFAULT_THRESHOLDS[s.key].hi).toEqual("hi" in s ? s.hi : undefined);
      expect(DEFAULT_THRESHOLDS[s.key].lo).toEqual("lo" in s ? s.lo : undefined);
    }
    expect(sidesOf("pressure")).toEqual(["lo", "hi"]);
    expect(sidesOf("o2")).toEqual(["lo"]);
  });
});

describe("thresholdsSchema", () => {
  it("accepts the defaults and edited bounds that keep their order", () => {
    expect(thresholdsSchema.safeParse(DEFAULT_THRESHOLDS).success).toBe(true);
    expect(thresholdsSchema.safeParse(withSensor("temperature", { hi: [28, 33] })).success).toBe(true);
  });

  it("rejects hi bounds whose warning is not below critical", () => {
    expect(issuePaths(withSensor("temperature", { hi: [35, 35] }))).toEqual(["temperature.hi"]);
  });

  it("rejects lo bounds whose warning is not above critical", () => {
    expect(issuePaths(withSensor("o2", { lo: [18, 19] }))).toEqual(["o2.lo"]);
  });

  it("rejects overlapping sides on two-sided sensors", () => {
    expect(issuePaths(withSensor("pressure", { lo: [1000, 970], hi: [990, 1055] }))).toEqual(["pressure.hi"]);
  });

  it("rejects adding or dropping a side", () => {
    expect(issuePaths(withSensor("temperature", { hi: [30, 35], lo: [5, 0] }))).toEqual(["temperature.lo"]);
    expect(issuePaths(withSensor("pressure", { hi: [1040, 1055] }))).toEqual(["pressure.lo"]);
  });

  it("rejects missing sensors, non-numbers and non-finite values", () => {
    const partial: Partial<Thresholds> = { ...DEFAULT_THRESHOLDS };
    delete partial.co2;
    expect(thresholdsSchema.safeParse(partial).success).toBe(false);
    expect(thresholdsSchema.safeParse(withSensor("co2", { hi: ["1000", 1500] as unknown as [number, number] })).success).toBe(false);
    expect(thresholdsSchema.safeParse(withSensor("co2", { hi: [1000, Infinity] })).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(thresholdsSchema.safeParse(withSensor("co2", { hi: [1000, 1500], mid: [1, 2] } as never)).success).toBe(false);
  });
});

describe("active thresholds", () => {
  it("starts on the defaults and swaps atomically", () => {
    expect(getThresholds()).toBe(DEFAULT_THRESHOLDS);
    const next = { ...DEFAULT_THRESHOLDS, co2: { hi: [800, 1200] as const } };
    setThresholds(next);
    expect(getThresholds()).toBe(next);
    expect(boundsFor(sensorIndex("co2")).hi).toEqual([800, 1200]);
  });
});
