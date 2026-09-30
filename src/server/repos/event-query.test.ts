import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, eventFilter, eventsQuerySchema } from "./event-query";

describe("eventsQuerySchema", () => {
  it("parses comma lists, defaults the limit and bounds it", () => {
    expect(eventsQuerySchema.parse({ kind: "raised, acked", severity: "CRITICAL" })).toMatchObject({ kind: ["raised", "acked"], severity: ["CRITICAL"], limit: 25 });
    expect(eventsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("rejects unknown kinds, severities and malformed device ids", () => {
    expect(eventsQuerySchema.safeParse({ kind: "exploded" }).success).toBe(false);
    expect(eventsQuerySchema.safeParse({ severity: "SEVERE" }).success).toBe(false);
    expect(eventsQuerySchema.safeParse({ deviceId: "DEV-1" }).success).toBe(false);
    expect(eventsQuerySchema.safeParse({ kind: "" }).success).toBe(false);
  });
});

describe("cursor", () => {
  it("round-trips and rejects anything we did not issue", () => {
    const c = { ts: "2026-09-30T10:00:00.000Z", id: "EVT-abc-12" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("yesterday|x").toString("base64url"))).toBeNull();
  });
});

describe("eventFilter", () => {
  it("is empty without filters", () => {
    expect(eventFilter({}, null)).toEqual({});
  });

  it("combines device, kind, severity and the keyset condition", () => {
    const f = eventFilter({ deviceId: "DEV-00001", kind: ["raised"], severity: ["CRITICAL", "WARNING"] }, { ts: "2026-09-30T10:00:00.000Z", id: "E-5" });
    const ts = new Date("2026-09-30T10:00:00.000Z");
    expect(f).toEqual({
      $and: [{ deviceId: "DEV-00001" }, { kind: { $in: ["raised"] } }, { severity: { $in: ["CRITICAL", "WARNING"] } }, { $or: [{ ts: { $lt: ts } }, { ts, _id: { $lt: "E-5" } }] }],
    });
  });
});
