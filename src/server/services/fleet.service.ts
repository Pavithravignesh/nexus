import { z } from "zod";
import { FLOORS, ZONES, deviceIdxFor } from "@/shared/fleet";
import { SENSORS, SENSOR_COUNT, SENSOR_KEYS, roundFor, sensorIndex, type SensorKey } from "@/shared/sensors";
import { OFFLINE, STATUS_NAMES, worstSensor, type StatusName } from "@/shared/status";
import type { Alert, DeltaRow, DeviceMeta, Summary, TelemetryEvent } from "@/shared/types";
import { ApiError } from "../errors";
import type { SimEngine } from "../sim/engine";

// Read models over the live in-memory fleet. Pure functions of the engine so they are
// tested without HTTP or MongoDB; route handlers pass getRuntime().engine.

export type DeviceListItem = DeviceMeta & {
  status: StatusName;
  lastSeen: string;
  worstSensor: SensorKey | null;
  values: number[];
};

export const listQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
  status: z.enum(STATUS_NAMES).optional(),
  floor: z.coerce.number().int().refine((f) => (FLOORS as readonly number[]).includes(f), "unknown floor").optional(),
  zone: z.enum(ZONES).optional(),
  sensor: z.enum(SENSOR_KEYS).optional().describe("only devices breaching this sensor"),
  sort: z.enum(["severity", "deviceId", "lastSeen", ...SENSOR_KEYS]).default("severity"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(10_000).default(100),
  cursor: z.coerce.number().int().min(0).default(0),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export function listItem(engine: SimEngine, idx: number): DeviceListItem {
  const { state } = engine;
  const d = state.devices[idx];
  if (!d) throw new ApiError(404, "NOT_FOUND", `No device at index ${idx}`);
  const st = (state.status[idx] ?? 0) as 0 | 1 | 2 | 3;
  const w = worstSensor(state.readingStatus, idx);
  const values: number[] = [];
  for (let j = 0; j < SENSOR_COUNT; j++) values.push(roundFor(j, state.values[idx * SENSOR_COUNT + j] ?? 0));
  return {
    ...d,
    status: STATUS_NAMES[st],
    lastSeen: new Date(state.lastSeen[idx] ?? 0).toISOString(),
    worstSensor: st === OFFLINE || !state.readingStatus[idx * SENSOR_COUNT + w] ? null : (SENSOR_KEYS[w] ?? null),
    values,
  };
}

/** Severity order for sorting: critical > warning > offline > normal. */
const SEVERITY_RANK = [0, 2, 3, 1];

export function listDevices(engine: SimEngine, query: ListQuery): { items: DeviceListItem[]; total: number; nextCursor: number | null } {
  const { state } = engine;
  const q = query.q?.toLowerCase();
  const statusCode = query.status ? STATUS_NAMES.indexOf(query.status) : -1;
  const sensorIdx = query.sensor ? sensorIndex(query.sensor) : -1;
  const ids: number[] = [];
  for (const d of state.devices) {
    const st = state.status[d.idx] ?? 0;
    if (statusCode >= 0 && st !== statusCode) continue;
    if (query.floor && d.floor !== query.floor) continue;
    if (query.zone && d.zone !== query.zone) continue;
    if (sensorIdx >= 0 && (st === OFFLINE || !state.readingStatus[d.idx * SENSOR_COUNT + sensorIdx])) continue;
    if (q && !d.deviceId.toLowerCase().includes(q) && !`${d.zone}${d.floor}`.toLowerCase().includes(q) && !d.name.toLowerCase().includes(q) && !d.type.toLowerCase().includes(q)) continue;
    ids.push(d.idx);
  }

  const key = (i: number): number | string => {
    switch (query.sort) {
      case "severity":
        return SEVERITY_RANK[state.status[i] ?? 0] ?? 0;
      case "deviceId":
        return i;
      case "lastSeen":
        return state.lastSeen[i] ?? 0;
      default:
        return state.values[i * SENSOR_COUNT + sensorIndex(query.sort)] ?? 0;
    }
  };
  const sign = query.dir === "asc" ? 1 : -1;
  ids.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x === y ? a - b : (x > y ? 1 : -1) * sign;
  });

  const page = ids.slice(query.cursor, query.cursor + query.limit);
  const next = query.cursor + query.limit;
  return { items: page.map((i) => listItem(engine, i)), total: ids.length, nextCursor: next < ids.length ? next : null };
}

export function requireDeviceIdx(engine: SimEngine, deviceId: string): number {
  const idx = deviceIdxFor(deviceId);
  if (idx === null || idx >= engine.state.devices.length) throw new ApiError(404, "NOT_FOUND", `Device ${deviceId} not found`);
  return idx;
}

export type DeviceDetail = DeviceListItem & {
  readings: { sensor: SensorKey; label: string; value: number; unit: string; status: StatusName }[];
  alert: Alert | null;
  events: TelemetryEvent[];
};

export function deviceDetail(engine: SimEngine, idx: number, events: TelemetryEvent[]): DeviceDetail {
  const item = listItem(engine, idx);
  const offline = item.status === "OFFLINE";
  return {
    ...item,
    readings: SENSORS.map((s, j) => ({
      sensor: s.key,
      label: s.label,
      value: item.values[j] ?? 0,
      unit: s.unit,
      status: offline ? "OFFLINE" : STATUS_NAMES[(engine.state.readingStatus[idx * SENSOR_COUNT + j] ?? 0) as 0 | 1 | 2],
    })),
    alert: engine.alertFor(idx) ?? null,
    events,
  };
}

export const historyQuerySchema = z.object({
  sensor: z.enum(SENSOR_KEYS).optional(),
  /** Seconds of history to return (the ring holds ~5 minutes). */
  window: z.coerce.number().int().min(10).max(3600).default(300),
});

export function deviceHistory(engine: SimEngine, idx: number, query: z.infer<typeof historyQuerySchema>, nowMs: number): { deviceId: string; series: Partial<Record<SensorKey, { ts: string; value: number }[]>> } {
  const since = nowMs - query.window * 1000;
  const keys = query.sensor ? [query.sensor] : SENSOR_KEYS;
  const series: Partial<Record<SensorKey, { ts: string; value: number }[]>> = {};
  for (const k of keys) {
    const j = sensorIndex(k);
    series[k] = engine.history.series(idx, j, since).map((p) => ({ ts: new Date(p.ts).toISOString(), value: roundFor(j, p.value) }));
  }
  return { deviceId: engine.state.devices[idx]?.deviceId ?? "", series };
}

export function latestTelemetry(engine: SimEngine): { seq: number; ts: string; rows: DeltaRow[] } {
  return { seq: engine.seq, ts: engine.summary.ts, rows: engine.state.devices.map((d) => engine.deltaRow(d.idx)) };
}

export function summaryWithAlerts(engine: SimEngine, alertLimit: number): { summary: Summary; alerts: Alert[]; openAlerts: number } {
  const alerts = engine.alerts();
  return { summary: engine.summary, alerts: alerts.slice(0, alertLimit), openAlerts: alerts.length };
}
