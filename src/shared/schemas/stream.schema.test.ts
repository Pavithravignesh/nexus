import { describe, expect, it } from "vitest";
import { deviceIdFor, deviceIdxFor } from "../fleet";
import { alertFrameSchema, deltaFrameSchema, helloSchema } from "./stream.schema";

const ts = "2026-09-28T10:00:00.000Z";
const values = [23.4, 46, 650, 20.9, 28, 12, 24, 1013, 52, 8];

describe("deltaFrameSchema", () => {
  it("accepts packed rows with ten values, nulls allowed", () => {
    const r = deltaFrameSchema.safeParse({ seq: 3, ts, rows: [[17, 1, 1759053601000, ...values], [18, 3, 0, ...values.map(() => null)]] });
    expect(r.success).toBe(true);
  });

  it("rejects rows with the wrong number of values", () => {
    expect(deltaFrameSchema.safeParse({ seq: 3, ts, rows: [[17, 1, 0, ...values.slice(1)]] }).success).toBe(false);
  });

  it("rejects an unknown status code", () => {
    expect(deltaFrameSchema.safeParse({ seq: 3, ts, rows: [[17, 4, 0, ...values]] }).success).toBe(false);
  });

  it("rejects non-ISO timestamps", () => {
    expect(deltaFrameSchema.safeParse({ seq: 3, ts: "yesterday", rows: [] }).success).toBe(false);
  });
});

describe("alertFrameSchema", () => {
  const alert = { id: "ALR-1", deviceIdx: 4210, deviceId: "DEV-04211", sensor: "co2", severity: "CRITICAL", value: 1650, raisedAt: ts, ackedAt: null };

  it("accepts raised and cleared alerts", () => {
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [alert], cleared: ["ALR-0"], acked: [] }).success).toBe(true);
  });

  it("accepts offline alerts without a sensor", () => {
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [{ ...alert, sensor: null, severity: "OFFLINE", value: null }], cleared: [], acked: [] }).success).toBe(true);
  });

  it("rejects NORMAL as an alert severity and unknown sensors", () => {
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [{ ...alert, severity: "NORMAL" }], cleared: [], acked: [] }).success).toBe(false);
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [{ ...alert, sensor: "radon" }], cleared: [], acked: [] }).success).toBe(false);
  });

  it("accepts ack-only frames and acknowledged alerts", () => {
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [], cleared: [], acked: [{ id: "ALR-1", ackedAt: ts }] }).success).toBe(true);
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [{ ...alert, ackedAt: ts }], cleared: [], acked: [] }).success).toBe(true);
  });

  it("rejects frames without acked, bad ack timestamps, empty ids and alerts missing ackedAt", () => {
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [], cleared: [] }).success).toBe(false);
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [], cleared: [], acked: [{ id: "ALR-1", ackedAt: "now" }] }).success).toBe(false);
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [], cleared: [], acked: [{ id: "", ackedAt: ts }] }).success).toBe(false);
    const legacy: Record<string, unknown> = { ...alert };
    delete legacy.ackedAt;
    expect(alertFrameSchema.safeParse({ seq: 1, raised: [legacy], cleared: [], acked: [] }).success).toBe(false);
  });
});

describe("helloSchema", () => {
  it("requires a positive tick", () => {
    expect(helloSchema.safeParse({ serverTime: ts, seq: 0, tickMs: 1000 }).success).toBe(true);
    expect(helloSchema.safeParse({ serverTime: ts, seq: 0, tickMs: 0 }).success).toBe(false);
  });
});

describe("device ids", () => {
  it("round-trips between index and id", () => {
    expect(deviceIdFor(0)).toBe("DEV-00001");
    expect(deviceIdFor(9999)).toBe("DEV-10000");
    expect(deviceIdxFor("DEV-04211")).toBe(4210);
  });

  it("rejects ids outside the fleet", () => {
    expect(deviceIdxFor("DEV-00000")).toBeNull();
    expect(deviceIdxFor("DEV-10001")).toBeNull();
    expect(deviceIdxFor("dev-1")).toBeNull();
  });
});
