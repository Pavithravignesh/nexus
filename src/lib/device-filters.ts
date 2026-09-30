import { DEVICE_TYPES, FLOORS, ZONES, type DeviceType, type Floor, type Zone } from "@/shared/fleet";
import { SENSOR_COUNT } from "@/shared/sensors";
import { OFFLINE, type StatusCode } from "@/shared/status";
import type { DeviceMeta } from "@/shared/types";

// The dashboard-wide device filter. One pure predicate drives the table, alerts, 3D view and
// charts' dimming, so every panel agrees on what "filtered" means.

export type DeviceFilters = {
  q: string;
  status: StatusCode | null;
  zone: Zone | null;
  floor: Floor | null;
  /** Sensor index: only devices whose reading for it is warning/critical. */
  sensor: number | null;
  type: DeviceType | null;
  /** Only online devices whose last report is older than the stale window. */
  stale: boolean;
};

export const EMPTY_FILTERS: DeviceFilters = { q: "", status: null, zone: null, floor: null, sensor: null, type: null, stale: false };

/** The slice of the telemetry store the predicate reads (a TelemetryStore satisfies it). */
export type FilterSource = {
  devices: readonly DeviceMeta[];
  status: Uint8Array;
  lastSeen: Float64Array;
  readingStatus: Uint8Array;
};

export function isFiltered(f: DeviceFilters): boolean {
  return f.status !== null || f.zone !== null || f.floor !== null || f.sensor !== null || f.type !== null || f.stale || f.q.trim() !== "";
}

/** Stable string for memo keys (the predicate itself is a new function every render). */
export function filtersKey(f: DeviceFilters): string {
  return [f.status, f.zone, f.floor, f.sensor, f.type, f.stale, f.q.trim().toLowerCase()].join("|");
}

/** Case-insensitive search over id, name, type, zone key (C2), rack (R-12) and room. */
function matchesQuery(d: DeviceMeta, q: string): boolean {
  if (!q) return true;
  return [d.deviceId, d.name, d.type, `${d.zone}${d.floor}`, d.rack, `room ${d.room}`, d.room].some((field) => field.toLowerCase().includes(q));
}

export function matchesDevice(src: FilterSource, f: DeviceFilters, i: number, nowMs: number, staleAfterMs: number): boolean {
  const d = src.devices[i];
  if (!d) return false;
  const st = src.status[i] ?? 0;
  if (f.status !== null && st !== f.status) return false;
  if (f.zone && d.zone !== f.zone) return false;
  if (f.floor && d.floor !== f.floor) return false;
  if (f.type && d.type !== f.type) return false;
  if (f.sensor !== null && (st === OFFLINE || !src.readingStatus[i * SENSOR_COUNT + f.sensor])) return false;
  if (f.stale && (st === OFFLINE || nowMs - (src.lastSeen[i] ?? 0) <= staleAfterMs)) return false;
  return matchesQuery(d, f.q.trim().toLowerCase());
}

export const FILTER_OPTIONS = { floors: FLOORS, zones: ZONES, types: DEVICE_TYPES } as const;
