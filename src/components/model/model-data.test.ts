import { describe, expect, it } from "vitest";
import { TelemetryStore } from "@/lib/telemetry-store";
import { SimEngine } from "@/server/sim/engine";
import { encodeFrame } from "@/server/services/stream-hub";
import { SENSOR_COUNT, sensorIndex } from "@/shared/sensors";
import { deltaRowSchema } from "@/shared/schemas/stream.schema";
import type { Alert } from "@/shared/types";
import {
  ENTITIES,
  ENTITY_NAMES,
  RELATIONS,
  alertSample,
  appendSample,
  defaultDevice,
  deltaDevices,
  deltaSample,
  deviceSample,
  packedRow,
  readingSample,
  related,
  sensorTypeSample,
  sseFrame,
  summarySample,
} from "./model-data";

const T0 = Date.UTC(2026, 8, 28, 10);

function setup(): { store: TelemetryStore; engine: SimEngine } {
  const engine = new SimEngine({ seed: 7, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 50 });
  const store = new TelemetryStore(() => {}, () => T0);
  store.applySnapshot({ devices: engine.state.devices, rows: engine.state.devices.map((d) => engine.deltaRow(d.idx)), seq: 4, summary: engine.summary, alerts: engine.alerts() });
  return { store, engine };
}

const alert = (idx: number): Alert => ({ id: `A-${idx}`, deviceIdx: idx, deviceId: `DEV-${String(idx + 1).padStart(5, "0")}`, sensor: "co2", severity: "CRITICAL", value: 1600, raisedAt: new Date(T0).toISOString() });

describe("ERD catalogue", () => {
  it("has the eight entities and relations only between known entities", () => {
    expect(Object.keys(ENTITIES).sort()).toEqual([...ENTITY_NAMES].sort());
    expect(RELATIONS).toHaveLength(8);
    for (const r of RELATIONS) {
      expect(ENTITY_NAMES).toContain(r.from);
      expect(ENTITY_NAMES).toContain(r.to);
    }
  });

  it("finds an entity's relations and neighbours", () => {
    const { rels, ents } = related("Alert");
    expect(rels.map((r) => `${r.from}>${r.to}`).sort()).toEqual(["Alert>Event", "Reading>Alert"]);
    expect([...ents].sort()).toEqual(["Alert", "Event", "Reading"]);
    expect(related(null).ents.size).toBe(0);
  });
});

describe("live samples", () => {
  it("picks the first alerted device, else device 0", () => {
    const { store } = setup();
    expect(defaultDevice({ ...store, alerts: [alert(7), alert(3)] })).toBe(7);
    expect(defaultDevice({ ...store, alerts: [] })).toBe(0);
    expect(defaultDevice({ ...store, alerts: [alert(999)] })).toBe(0);
  });

  it("builds device and reading documents from the typed arrays", () => {
    const { store, engine } = setup();
    const dev = deviceSample(store, 5);
    expect(dev).toMatchObject({ _id: "DEV-00006", zone: engine.state.devices[5]?.zone });
    expect(typeof dev?.status).toBe("string");
    const j = sensorIndex("co2");
    const r = readingSample(store, 5, j);
    expect(r).toMatchObject({ _id: "DEV-00006:co2", deviceId: "DEV-00006", sensor: "co2", unit: "ppm" });
    expect(r?.value).toBe(Math.round(store.values[5 * SENSOR_COUNT + j] ?? 0));
    expect(deviceSample(store, 999)).toBeNull();
    expect(sensorTypeSample(j)).toMatchObject({ key: "co2", hi: [1000, 1500] });
  });

  it("packs delta rows the stream schema accepts", () => {
    const { store, engine } = setup();
    const row = packedRow(store, 3);
    expect(deltaRowSchema.safeParse(row).success).toBe(true);
    expect(row).toEqual(engine.deltaRow(3));
    const d = deltaSample(store, deltaDevices(49, 50), 12, new Date(T0).toISOString(), 900);
    expect((d.rows as unknown[]).length).toBe(3);
    expect(d["…"]).toContain("897 more rows");
    expect(deltaDevices(49, 50)).toEqual([49, 0, 1]);
    expect(deltaDevices(0, 1)).toEqual([0]);
  });

  it("trims the summary to a few zones with a note", () => {
    const { store } = setup();
    const s = summarySample(store.summary, 3);
    const zones = s?.byZone as Record<string, unknown>;
    expect(Object.keys(zones)).toEqual(["A1", "B1", "C1", "…"]);
    expect(zones["…"]).toContain("21 more zones");
    expect(summarySample(null)).toBeNull();
  });

  it("describes the first alert or an empty state", () => {
    expect(alertSample([alert(1), alert(2)])).toMatchObject({ id: "A-1", "…": "1 more open alerts" });
    expect(alertSample([])).toHaveProperty("// empty");
  });

  it("appends live history points without duplicates", () => {
    const a = [{ ts: "2026-09-28T10:00:00.000Z", value: 1 }];
    expect(appendSample(a, { ts: "2026-09-28T10:00:00.000Z", value: 2 }, 5)).toEqual(a);
    expect(appendSample(a, { ts: "2026-09-28T10:00:01.000Z", value: 2 }, 1)).toEqual([{ ts: "2026-09-28T10:00:01.000Z", value: 2 }]);
  });

  it("formats an SSE frame like the stream hub", () => {
    expect(sseFrame("delta", 3, { a: 1 })).toBe(encodeFrame("delta", 3, { a: 1 }));
  });
});
