import { describe, expect, it } from "vitest";
import { deltaRowSchema, summarySchema } from "@/shared/schemas/stream.schema";
import { ApiError } from "../errors";
import { SimEngine } from "../sim/engine";
import { deviceDetail, deviceHistory, historyQuerySchema, latestTelemetry, listDevices, listQuerySchema, requireDeviceIdx, summaryWithAlerts } from "./fleet.service";

const T0 = Date.UTC(2026, 8, 28, 10);
const engine = new SimEngine({ seed: 11, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 2000, sampleEveryMs: 1000 });
for (let k = 1; k <= 30; k++) engine.step(T0 + k * 1000);
const q = (raw: Record<string, string>): ReturnType<typeof listQuerySchema.parse> => listQuerySchema.parse(raw);

describe("listDevices", () => {
  it("pages with a cursor and reports the total", () => {
    const first = listDevices(engine, q({ limit: "50" }));
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(2000);
    expect(first.nextCursor).toBe(50);
    const last = listDevices(engine, q({ limit: "50", cursor: "1990" }));
    expect(last.items).toHaveLength(10);
    expect(last.nextCursor).toBeNull();
  });

  it("sorts by severity: critical, then warning, then offline, then normal", () => {
    const order = listDevices(engine, q({ limit: "2000" })).items.map((d) => d.status);
    const rank = { CRITICAL: 0, WARNING: 1, OFFLINE: 2, NORMAL: 3 };
    for (let i = 1; i < order.length; i++) expect(rank[order[i]!]).toBeGreaterThanOrEqual(rank[order[i - 1]!]);
  });

  it("filters by status, location and breaching sensor", () => {
    const crit = listDevices(engine, q({ status: "CRITICAL", limit: "2000" }));
    expect(crit.items.every((d) => d.status === "CRITICAL")).toBe(true);
    expect(crit.total).toBe(engine.summary.byStatus.CRITICAL);
    const zone = listDevices(engine, q({ zone: "C", floor: "2", limit: "2000" }));
    expect(zone.items.every((d) => d.zone === "C" && d.floor === 2)).toBe(true);
    const co2 = listDevices(engine, q({ sensor: "co2", limit: "2000" }));
    expect(co2.total).toBe(engine.summary.bySensor.co2.warning + engine.summary.bySensor.co2.critical);
  });

  it("searches ids case-insensitively", () => {
    const r = listDevices(engine, q({ q: "dev-0012" }));
    expect(r.items.map((d) => d.deviceId)).toEqual(expect.arrayContaining(["DEV-00120", "DEV-00121"]));
    expect(r.items.every((d) => d.deviceId.includes("DEV-0012"))).toBe(true);
  });

  it("sorts by a sensor value", () => {
    const vals = listDevices(engine, q({ sort: "temperature", dir: "asc", limit: "100" })).items.map((d) => d.values[0]!);
    expect([...vals].sort((a, b) => a - b)).toEqual(vals);
  });

  it("rejects unknown filters", () => {
    expect(listQuerySchema.safeParse({ status: "BROKEN" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ floor: "9" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });
});

describe("device lookups", () => {
  it("resolves ids and 404s on anything else", () => {
    expect(requireDeviceIdx(engine, "DEV-00005")).toBe(4);
    expect(() => requireDeviceIdx(engine, "DEV-09999")).toThrow(ApiError);
    expect(() => requireDeviceIdx(engine, "nope")).toThrow(/not found/);
  });

  it("returns ten readings plus the open alert", () => {
    const idx = engine.alerts()[0]!.deviceIdx;
    const d = deviceDetail(engine, idx, []);
    expect(d.readings).toHaveLength(10);
    expect(d.alert?.deviceIdx).toBe(idx);
    expect(d.status).not.toBe("NORMAL");
  });

  it("returns history oldest first within the window", () => {
    const h = deviceHistory(engine, 7, historyQuerySchema.parse({ sensor: "co2", window: "10" }), T0 + 30_000);
    const pts = h.series.co2!;
    expect(pts.length).toBeGreaterThanOrEqual(9);
    expect(pts.length).toBeLessThanOrEqual(11);
    expect(Date.parse(pts[0]!.ts)).toBeLessThan(Date.parse(pts.at(-1)!.ts));
    expect(Object.keys(deviceHistory(engine, 7, historyQuerySchema.parse({}), T0 + 30_000).series)).toHaveLength(10);
  });
});

describe("snapshots", () => {
  it("returns one schema-valid row per device", () => {
    const t = latestTelemetry(engine);
    expect(t.rows).toHaveLength(2000);
    expect(deltaRowSchema.safeParse(t.rows[0]).success).toBe(true);
  });

  it("returns the summary with the top alerts, critical first", () => {
    const s = summaryWithAlerts(engine, 5);
    expect(summarySchema.safeParse(s.summary).success).toBe(true);
    expect(s.alerts.length).toBeLessThanOrEqual(5);
    expect(s.openAlerts).toBeGreaterThanOrEqual(s.alerts.length);
  });
});
