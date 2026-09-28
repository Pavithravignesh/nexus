import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults for a bare environment", () => {
    const e = loadEnv({});
    expect(e.TICK_MS).toBe(1000);
    expect(e.CHANGE_RATIO).toBe(0.1);
    expect(e.MONGODB_DB).toBe("nexus");
  });

  it("coerces numeric strings", () => {
    expect(loadEnv({ TICK_MS: "500", CHANGE_RATIO: "0.25" })).toMatchObject({ TICK_MS: 500, CHANGE_RATIO: 0.25 });
  });

  it("names every invalid variable", () => {
    expect(() => loadEnv({ TICK_MS: "5", CHANGE_RATIO: "2" })).toThrow(/TICK_MS[\s\S]*CHANGE_RATIO|CHANGE_RATIO[\s\S]*TICK_MS/);
  });

  it("requires the stale window to be shorter than the offline window", () => {
    expect(() => loadEnv({ STALE_AFTER_MS: "30000", OFFLINE_AFTER_MS: "30000" })).toThrow(/STALE_AFTER_MS/);
  });
});
