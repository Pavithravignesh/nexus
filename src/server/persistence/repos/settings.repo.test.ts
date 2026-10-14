import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/shared/thresholds";
import { thresholdsFromDoc } from "./settings.repo";

const doc = (value: unknown): { _id: string; value: unknown; updatedAt: Date } => ({ _id: "thresholds", value, updatedAt: new Date() });

describe("thresholdsFromDoc", () => {
  it("returns a stored set that still validates", () => {
    const stored = { ...DEFAULT_THRESHOLDS, co2: { hi: [900, 1200] } };
    expect(thresholdsFromDoc(doc(stored))).toEqual(stored);
  });

  it("ignores a missing or no longer valid document", () => {
    expect(thresholdsFromDoc(null)).toBeNull();
    expect(thresholdsFromDoc(doc({ co2: { hi: [900, 1200] } }))).toBeNull();
  });
});
