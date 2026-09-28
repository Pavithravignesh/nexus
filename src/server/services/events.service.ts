import { logger } from "../logger";
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
