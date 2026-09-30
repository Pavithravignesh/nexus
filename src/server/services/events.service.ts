import { logger } from "../logger";
import { ApiError } from "../errors";
import { decodeCursor, type EventsQuery } from "../repos/event-query";
import { eventsRepo } from "../repos/events.repo";
import type { TelemetryEvent } from "@/shared/types";

/** Recent persisted events for one device; empty (not an error) when MongoDB is unavailable. */
export async function recentDeviceEvents(deviceId: string, limit = 10): Promise<TelemetryEvent[]> {
  try {
    return await eventsRepo.recent(limit, deviceId);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err, deviceId }, "events unavailable");
    return [];
  }
}

export type EventsPage = { items: TelemetryEvent[]; nextCursor: string | null; available: boolean };

/** A page of persisted events. MongoDB down is not an error for the UI: it says "unavailable". */
export async function listEvents(q: EventsQuery): Promise<EventsPage> {
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !after) throw new ApiError(400, "VALIDATION_FAILED", "Invalid cursor");
  try {
    return { ...(await eventsRepo.page(q, after)), available: true };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "events unavailable");
    return { items: [], nextCursor: null, available: false };
  }
}
