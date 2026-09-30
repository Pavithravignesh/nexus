import { ZONE_KEYS, zoneKey } from "@/shared/fleet";
import { SENSORS, SENSOR_COUNT, roundFor, sensorAt } from "@/shared/sensors";
import { STATUS_NAMES, type StatusCode } from "@/shared/status";
import type { Alert, DeltaRow, DeviceMeta, Summary, TelemetryEvent } from "@/shared/types";

// Pure data for the /model page: the entity catalogue, the relations, and the builders that
// turn the live TelemetryStore into JSON samples. No React here so it is unit-testable in node.

export type Storage = "mongo" | "memory" | "wire" | "code";

export const STORAGE_UI: Record<Storage, { label: string; color: string }> = {
  mongo: { label: "MongoDB", color: "var(--accent)" },
  memory: { label: "memory", color: "var(--st-warning)" },
  wire: { label: "SSE wire", color: "var(--accent-2)" },
  code: { label: "shared code", color: "var(--st-offline)" },
};

export const ENTITY_NAMES = ["SensorType", "Device", "Reading", "Sample", "Alert", "Event", "Summary", "Delta"] as const;
export type EntityName = (typeof ENTITY_NAMES)[number];

export type Entity = {
  storage: Storage;
  where: string;
  desc: string;
  fields: readonly string[];
  /** Top-left corner in the ERD viewBox. */
  x: number;
  y: number;
};

export const ERD_W = 1000;
export const ERD_H = 600;
export const BOX_W = 220;
const COL = [16, 390, 764] as const;
const MID = [203, 577] as const;

export const ENTITIES: Record<EntityName, Entity> = {
  SensorType: {
    storage: "code",
    where: "src/shared/sensors.ts",
    desc: "One of the ten measured quantities: temperature, humidity, co2, o2, no2, pm25, pm10, pressure, noise, occupancy. Units, decimals and warning/critical thresholds live here, one source for server and browser.",
    fields: ["key PK", "label", "unit", "decimals", "hi / lo [warn, crit]"],
    x: COL[0],
    y: 20,
  },
  Device: {
    storage: "mongo",
    where: "MongoDB · devices (10,000)",
    desc: "One physical unit with a stable deviceId (DEV-00001), a name, a device type and a location, reporting all ten sensor types.",
    fields: ["_id = deviceId PK", "name", "type", "site · floor · zone", "room · rack", "active"],
    x: COL[2],
    y: 20,
  },
  Summary: {
    storage: "wire",
    where: "SSE · event: summary (every tick)",
    desc: "The aggregate counts per status, per sensor type and per zone sent every tick and shown in KPIs and charts. Charts read this, never raw readings.",
    fields: ["ts · seq", "total · reporting", "byStatus", "bySensor", "byZone", "averages"],
    x: COL[1],
    y: 20,
  },
  Reading: {
    storage: "mongo",
    where: "MongoDB · latest_readings (100,000)",
    desc: "The latest value of one sensor type on one device, with unit, timestamp and reading status. Ten per device; upserted in unordered bulk writes every flush interval from the in-memory state.",
    fields: ["_id = deviceId:sensor PK", "deviceId FK", "sensor FK", "value · unit", "status", "ts · location"],
    x: MID[0],
    y: 225,
  },
  Alert: {
    storage: "memory",
    where: "memory (open alerts) → events",
    desc: "An open condition raised when a reading enters WARNING or CRITICAL (or a device goes OFFLINE), cleared when it returns to NORMAL.",
    fields: ["id PK", "deviceId FK", "sensor FK | null", "severity", "value", "raisedAt"],
    x: MID[1],
    y: 225,
  },
  Sample: {
    storage: "memory",
    where: "memory · history ring buffer (~5 min)",
    desc: "One historic (timestamp, value) entry for a device and sensor type, kept in the history ring. Served by GET /api/devices/{id}/history.",
    fields: ["deviceId FK", "sensor FK", "ts", "value"],
    x: COL[0],
    y: 420,
  },
  Delta: {
    storage: "wire",
    where: "SSE · event: delta (every tick)",
    desc: "The packed list of devices that changed in one tick: [idx, status, lastSeen, v0..v9]. Only changed devices travel, not all 10,000.",
    fields: ["seq · ts", "rows[ [idx, status, lastSeen, v0…v9] ]"],
    x: COL[1],
    y: 420,
  },
  Event: {
    storage: "mongo",
    where: "MongoDB · events (TTL 24 h)",
    desc: "An immutable record of a transition (raised, cleared, offline, online); the activity feed and the device timeline list events.",
    fields: ["_id = id PK", "deviceId FK", "kind", "severity", "sensor · value", "ts (TTL)"],
    x: COL[2],
    y: 420,
  },
};

export type Relation = { from: EntityName; to: EntityName; label: string };

export const RELATIONS: readonly Relation[] = [
  { from: "SensorType", to: "Reading", label: "1 : n" },
  { from: "Device", to: "Reading", label: "1 : 10" },
  { from: "Reading", to: "Sample", label: "history" },
  { from: "Reading", to: "Alert", label: "raises" },
  { from: "Alert", to: "Event", label: "writes" },
  { from: "Device", to: "Event", label: "1 : n" },
  { from: "Reading", to: "Summary", label: "aggregated into" },
  { from: "Reading", to: "Delta", label: "changes packed into" },
];

export function boxHeight(e: Entity): number {
  return 36 + e.fields.length * 18;
}

/** Relations touching an entity, and the set of entities it is directly connected to. */
export function related(name: EntityName | null): { rels: Relation[]; ents: Set<EntityName> } {
  if (!name) return { rels: [], ents: new Set() };
  const rels = RELATIONS.filter((r) => r.from === name || r.to === name);
  return { rels, ents: new Set<EntityName>([name, ...rels.flatMap((r) => [r.from, r.to])]) };
}

/* ---------- live samples ---------- */

/** The slice of TelemetryStore the samples read; the real store satisfies it. */
export type FleetView = {
  devices: readonly DeviceMeta[];
  status: Uint8Array;
  lastSeen: Float64Array;
  values: Float32Array;
  readingStatus: Uint8Array;
  alerts: readonly Alert[];
};

export const DEFAULT_SENSOR = sensorAt(2).key; // co2

/** First device with an open alert (alerts are sorted critical first), else device 0. */
export function defaultDevice(view: FleetView): number {
  const a = view.alerts.find((x) => x.deviceIdx < view.devices.length);
  return a ? a.deviceIdx : 0;
}

export function sensorTypeSample(sensorIdx: number): Record<string, unknown> {
  return { ...sensorAt(sensorIdx) };
}

export function deviceSample(view: FleetView, idx: number): Record<string, unknown> | null {
  const d = view.devices[idx];
  if (!d) return null;
  return {
    _id: d.deviceId,
    name: d.name,
    type: d.type,
    site: d.site,
    floor: d.floor,
    zone: d.zone,
    room: d.room,
    rack: d.rack,
    active: d.active,
    status: STATUS_NAMES[(view.status[idx] ?? 0) as StatusCode],
    lastSeen: new Date(view.lastSeen[idx] ?? 0).toISOString(),
  };
}

/** One latest_readings document, shaped exactly like the repo writes it. */
export function readingSample(view: FleetView, idx: number, sensorIdx: number): Record<string, unknown> | null {
  const d = view.devices[idx];
  const s = SENSORS[sensorIdx];
  if (!d || !s) return null;
  const at = idx * SENSOR_COUNT + sensorIdx;
  const offline = view.status[idx] === 3;
  return {
    _id: `${d.deviceId}:${s.key}`,
    deviceId: d.deviceId,
    sensor: s.key,
    value: roundFor(sensorIdx, view.values[at] ?? 0),
    unit: s.unit,
    status: offline ? "OFFLINE" : STATUS_NAMES[(view.readingStatus[at] ?? 0) as StatusCode],
    ts: new Date(view.lastSeen[idx] ?? 0).toISOString(),
    location: zoneKey(d.zone, d.floor),
    "…": `${SENSOR_COUNT - 1} more readings for ${d.deviceId}`,
  };
}

export type SamplePoint = { ts: string; value: number };

/** Append a live point to a fetched history unless it is already the last one; keep the newest `max`. */
export function appendSample(list: readonly SamplePoint[], point: SamplePoint, max: number): SamplePoint[] {
  const last = list.at(-1);
  if (last && last.ts >= point.ts) return list.slice(-max);
  return [...list, point].slice(-max);
}

export function alertSample(alerts: readonly Alert[]): Record<string, unknown> {
  const a = alerts[0];
  if (!a) return { "// empty": "no open alerts right now" };
  return { ...a, "…": `${Math.max(0, alerts.length - 1).toLocaleString("en-US")} more open alerts` };
}

export function eventSample(events: readonly TelemetryEvent[], n = 3): unknown[] {
  return events.slice(0, n);
}

export function summarySample(summary: Summary | null, zones = 3): Record<string, unknown> | null {
  if (!summary) return null;
  const keys = ZONE_KEYS.slice(0, zones);
  const byZone: Record<string, unknown> = {};
  for (const k of keys) byZone[k] = summary.byZone[k];
  byZone["…"] = `${ZONE_KEYS.length - keys.length} more zones, each [normal, warning, critical, offline]`;
  return { ...summary, byZone };
}

/** A packed delta row built from the store's typed arrays, like the server sends it. */
export function packedRow(view: FleetView, idx: number): DeltaRow {
  const row: DeltaRow = [idx, view.status[idx] ?? 0, view.lastSeen[idx] ?? 0];
  for (let j = 0; j < SENSOR_COUNT; j++) row.push(roundFor(j, view.values[idx * SENSOR_COUNT + j] ?? 0));
  return row;
}

export function deltaSample(view: FleetView, idxs: readonly number[], seq: number, ts: string, reporting: number | null): Record<string, unknown> {
  const rows = idxs.filter((i) => i >= 0 && i < view.devices.length).map((i) => packedRow(view, i));
  return {
    seq,
    ts,
    rows,
    "…": reporting === null ? "waiting for the first summary" : `${Math.max(0, reporting - rows.length).toLocaleString("en-US")} more rows this tick (${reporting.toLocaleString("en-US")} devices reported)`,
  };
}

/** The three devices shown in the Delta sample: the chosen one and its two neighbours. */
export function deltaDevices(idx: number, total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>();
  for (const i of [idx, idx + 1, idx + 2]) out.add(((i % total) + total) % total);
  return [...out];
}

/** One SSE frame exactly as the stream hub encodes it. */
export function sseFrame(event: string, id: number, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
