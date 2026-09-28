import { SENSOR_COUNT, sensorAt } from "./sensors";

// Status codes are small integers so they fit in Uint8Arrays and packed delta rows.
export const NORMAL = 0;
export const WARNING = 1;
export const CRITICAL = 2;
export const OFFLINE = 3;
export type StatusCode = typeof NORMAL | typeof WARNING | typeof CRITICAL | typeof OFFLINE;
/** A reading can never be OFFLINE; only a device can. */
export type ReadingStatusCode = typeof NORMAL | typeof WARNING | typeof CRITICAL;

export const STATUS_NAMES = ["NORMAL", "WARNING", "CRITICAL", "OFFLINE"] as const;
export type StatusName = (typeof STATUS_NAMES)[number];

export function statusName(code: StatusCode): StatusName {
  return STATUS_NAMES[code];
}

/** Reading status of one value against its sensor's thresholds. */
export function readingStatus(sensorIdx: number, value: number): ReadingStatusCode {
  const s = sensorAt(sensorIdx);
  if (s.hi) {
    if (value >= s.hi[1]) return CRITICAL;
    if (value >= s.hi[0]) return WARNING;
  }
  if (s.lo) {
    if (value <= s.lo[1]) return CRITICAL;
    if (value <= s.lo[0]) return WARNING;
  }
  return NORMAL;
}

/**
 * Device status: OFFLINE when silent longer than the offline window, otherwise the worst
 * reading status. `readings` holds all devices' reading statuses, SENSOR_COUNT per device.
 */
export function deviceStatus(
  readings: Uint8Array,
  idx: number,
  lastSeenMs: number,
  nowMs: number,
  offlineAfterMs: number,
): StatusCode {
  if (nowMs - lastSeenMs > offlineAfterMs) return OFFLINE;
  let worst: StatusCode = NORMAL;
  const base = idx * SENSOR_COUNT;
  for (let j = 0; j < SENSOR_COUNT; j++) {
    const r = readings[base + j] ?? NORMAL;
    if (r > worst) worst = r as StatusCode;
  }
  return worst;
}

/** Index (0..SENSOR_COUNT-1) of the device's worst reading; 0 when all are NORMAL. */
export function worstSensor(readings: Uint8Array, idx: number): number {
  let worst = NORMAL;
  let at = 0;
  const base = idx * SENSOR_COUNT;
  for (let j = 0; j < SENSOR_COUNT; j++) {
    const r = readings[base + j] ?? NORMAL;
    if (r > worst) {
      worst = r;
      at = j;
    }
  }
  return at;
}

export function isStale(lastSeenMs: number, nowMs: number, staleAfterMs: number, offlineAfterMs: number): boolean {
  const age = nowMs - lastSeenMs;
  return age > staleAfterMs && age <= offlineAfterMs;
}

/** Per-zone device counts indexed by status code: [normal, warning, critical, offline]. */
export type ZoneCounts = [number, number, number, number];

/**
 * Roll a zone up to one status for the heatmap and the 3D rack strips. Shares, not absolute
 * counts, so a zone is only flagged when a meaningful part of it is affected.
 */
export function zoneStatus(counts: ZoneCounts): StatusCode {
  const [n, w, c, o] = counts;
  const total = n + w + c + o;
  if (total === 0) return NORMAL;
  if (c / total > 0.011) return CRITICAL;
  if ((w + c) / total > 0.036) return WARNING;
  if (o / total > 0.03) return OFFLINE;
  return NORMAL;
}
