import { ZONE_KEYS, zoneKey, type ZoneKey } from "./fleet";
import { SENSOR_COUNT, SENSOR_KEYS, sensorIndex, type SensorKey } from "./sensors";
import { CRITICAL, OFFLINE, STATUS_NAMES, WARNING, type StatusName, type ZoneCounts } from "./status";
import type { FleetState, Summary } from "./types";

const TEMP = sensorIndex("temperature");
const HUM = sensorIndex("humidity");
const CO2 = sensorIndex("co2");

const round = (v: number, dp: number): number => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Aggregate the fleet into the per-tick Summary. Pure: the same function runs on the server
 * for every tick and in tests. Offline devices count only toward OFFLINE; their stale
 * readings are excluded from breaches and averages.
 */
export function summarize(state: FleetState, meta: { seq: number; nowMs: number; reporting: number }): Summary {
  const byStatus = Object.fromEntries(STATUS_NAMES.map((n) => [n, 0])) as Record<StatusName, number>;
  const breaches = SENSOR_KEYS.map(() => [0, 0] as [number, number]);
  const byZone = Object.fromEntries(ZONE_KEYS.map((k) => [k, [0, 0, 0, 0]])) as Record<ZoneKey, ZoneCounts>;
  let tSum = 0;
  let hSum = 0;
  let cSum = 0;
  let online = 0;

  for (const d of state.devices) {
    const st = state.status[d.idx] ?? 0;
    byStatus[STATUS_NAMES[st as 0 | 1 | 2 | 3]]++;
    byZone[zoneKey(d.zone, d.floor)][st as 0 | 1 | 2 | 3]++;
    if (st === OFFLINE) continue;
    online++;
    const base = d.idx * SENSOR_COUNT;
    tSum += state.values[base + TEMP] ?? 0;
    hSum += state.values[base + HUM] ?? 0;
    cSum += state.values[base + CO2] ?? 0;
    for (let j = 0; j < SENSOR_COUNT; j++) {
      const r = state.readingStatus[base + j];
      const b = breaches[j];
      if (!b) continue;
      if (r === WARNING) b[0]++;
      else if (r === CRITICAL) b[1]++;
    }
  }

  const bySensor = Object.fromEntries(
    SENSOR_KEYS.map((k, j) => [k, { warning: breaches[j]?.[0] ?? 0, critical: breaches[j]?.[1] ?? 0 }]),
  ) as Record<SensorKey, { warning: number; critical: number }>;
  const avg = (sum: number, dp: number): number => (online ? round(sum / online, dp) : 0);

  return {
    ts: new Date(meta.nowMs).toISOString(),
    seq: meta.seq,
    total: state.devices.length,
    reporting: meta.reporting,
    byStatus,
    bySensor,
    byZone,
    averages: { temperature: avg(tSum, 2), humidity: avg(hSum, 1), co2: avg(cSum, 0) },
  };
}
