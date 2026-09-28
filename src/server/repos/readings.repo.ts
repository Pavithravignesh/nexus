import type { AnyBulkWriteOperation } from "mongodb";
import { zoneKey } from "@/shared/fleet";
import { SENSORS, SENSOR_COUNT, roundFor } from "@/shared/sensors";
import { STATUS_NAMES } from "@/shared/status";
import type { FleetState } from "@/shared/types";
import { collections, type ReadingDoc } from "../db/collections";

const CHUNK = 20_000;

/** The ten latest-reading documents for one device, built from the in-memory fleet state. */
export function readingDocs(state: FleetState, idx: number): ReadingDoc[] {
  const d = state.devices[idx];
  if (!d) return [];
  const ts = new Date(state.lastSeen[idx] ?? 0);
  return SENSORS.map((s, j) => ({
    _id: `${d.deviceId}:${s.key}`,
    deviceId: d.deviceId,
    sensor: s.key,
    value: roundFor(j, state.values[idx * SENSOR_COUNT + j] ?? 0),
    unit: s.unit,
    status: STATUS_NAMES[(state.readingStatus[idx * SENSOR_COUNT + j] ?? 0) as 0 | 1 | 2],
    ts,
    location: zoneKey(d.zone, d.floor),
  }));
}

export const readingsRepo = {
  /** Upsert the latest readings of the given devices in unordered bulk writes. Returns documents written. */
  async upsertLatest(state: FleetState, idxs: readonly number[]): Promise<number> {
    if (!idxs.length) return 0;
    const col = await collections.readings();
    const ops: AnyBulkWriteOperation<ReadingDoc>[] = idxs.flatMap((i) => readingDocs(state, i).map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })));
    let written = 0;
    for (let k = 0; k < ops.length; k += CHUNK) {
      const res = await col.bulkWrite(ops.slice(k, k + CHUNK), { ordered: false });
      written += res.upsertedCount + res.matchedCount;
    }
    return written;
  },

  async count(): Promise<number> {
    return (await collections.readings()).countDocuments();
  },
};
