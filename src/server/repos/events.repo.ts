import type { TelemetryEvent } from "@/shared/types";
import { collections, type EventDoc } from "../db/collections";
import { encodeCursor, eventFilter, type Cursor, type EventsQuery } from "./event-query";

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

  /** One page, newest first, with a cursor for the next (older) page; fetches limit+1 to know. */
  async page(q: EventsQuery, after: Cursor | null): Promise<{ items: TelemetryEvent[]; nextCursor: string | null }> {
    const docs = await (await collections.events())
      .find(eventFilter(q, after))
      .sort({ ts: -1, _id: -1 })
      .limit(q.limit + 1)
      .toArray();
    const items = docs.slice(0, q.limit).map(fromDoc);
    const last = items.at(-1);
    return { items, nextCursor: docs.length > q.limit && last ? encodeCursor({ ts: last.ts, id: last.id }) : null };
  },

  async count(): Promise<number> {
    return (await collections.events()).estimatedDocumentCount();
  },
};
