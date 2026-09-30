import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/shared/thresholds";
import { checkDraft, toDraft } from "./thresholds-draft";

describe("thresholds draft", () => {
  it("round-trips the defaults", () => {
    const draft = toDraft(DEFAULT_THRESHOLDS);
    expect(draft.pressure).toEqual({ lo: ["985", "970"], hi: ["1040", "1055"] });
    expect(checkDraft(draft)).toEqual({ value: DEFAULT_THRESHOLDS, errors: new Map() });
  });

  it("reports an empty field as a missing number", () => {
    const draft = { ...toDraft(DEFAULT_THRESHOLDS), co2: { hi: ["", "1500"] as [string, string] } };
    const r = checkDraft(draft);
    expect(r.value).toBeNull();
    expect(r.errors.get("co2.hi")).toBe("enter a number");
  });

  it("reports an out-of-order pair on its sensor and side", () => {
    const draft = { ...toDraft(DEFAULT_THRESHOLDS), o2: { lo: ["18", "19"] as [string, string] } };
    expect(checkDraft(draft).errors.get("o2.lo")).toBe("warning must be above critical");
  });
});
