import type { Filter } from "mongodb";
import { z } from "zod";
import { STATUS_NAMES } from "@/shared/status";
import type { EventKind } from "@/shared/types";
import type { EventDoc } from "../db/collections";

// Query model for GET /api/events: filters plus keyset pagination on (ts desc, _id desc).
// Keyset (not skip/limit) because events arrive constantly: page 2 must not shift when new
// events land on page 1, and it stays fast however deep you page.

const EVENT_KINDS = ["raised", "cleared", "offline", "online", "acked"] as const satisfies readonly EventKind[];
const csv = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

export const eventsQuerySchema = z.object({
  deviceId: z.string().regex(/^DEV-\d{5}$/).optional(),
  kind: csv(EVENT_KINDS).optional(),
  severity: csv(STATUS_NAMES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  cursor: z.string().max(200).optional(),
});
export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export type Cursor = { ts: string; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.ts}|${c.id}`, "utf8").toString("base64url");
}

/** null for anything that is not a cursor we issued (tampered or truncated). */
export function decodeCursor(raw: string): Cursor | null {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const sep = text.indexOf("|");
  if (sep < 0) return null;
  const ts = text.slice(0, sep);
  const id = text.slice(sep + 1);
  return Number.isFinite(Date.parse(ts)) && id ? { ts, id } : null;
}

export function eventFilter(q: Pick<EventsQuery, "deviceId" | "kind" | "severity">, after: Cursor | null): Filter<EventDoc> {
  const and: Filter<EventDoc>[] = [];
  if (q.deviceId) and.push({ deviceId: q.deviceId });
  if (q.kind) and.push({ kind: { $in: q.kind } });
  if (q.severity) and.push({ severity: { $in: q.severity } });
  if (after) {
    const ts = new Date(after.ts);
    and.push({ $or: [{ ts: { $lt: ts } }, { ts, _id: { $lt: after.id } }] });
  }
  return and.length ? { $and: and } : {};
}
