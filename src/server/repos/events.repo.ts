import type { TelemetryEvent } from "@/shared/types";
import { collections, type EventDoc } from "../db/collections";

const toDoc = ({ id, ts, ...rest }: TelemetryEvent): EventDoc => ({ _id: id, ts: new Date(ts), ...rest });
const fromDoc = ({ _id, ts, ...rest }: EventDoc): TelemetryEvent => ({ id: _id, ts: ts.toISOString(), ...rest });

export const eventsRepo = {
  async insertMany(events: readonly TelemetryEvent[]): Promise<number> {
    if (!events.length) return 0;
    const res = await (await collections.events()).insertMany(events.map(toDoc), { ordered: false });
    return res.insertedCount;
  },

  /** Newest first, optionally for one device. */
  async recent(limit: number, deviceId?: string): Promise<TelemetryEvent[]> {
    const col = await collections.events();
    const docs = await col
      .find(deviceId ? { deviceId } : {})
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();
    return docs.map(fromDoc);
  },

  async count(): Promise<number> {
    return (await collections.events()).estimatedDocumentCount();
  },
};
