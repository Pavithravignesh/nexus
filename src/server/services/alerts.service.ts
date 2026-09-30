import { z } from "zod";
import type { Alert } from "@/shared/types";
import { ApiError } from "../errors";
import type { SimEngine } from "../sim/engine";
import type { StreamHub } from "./stream-hub";

const alertIdSchema = z.string().trim().min(1).max(64);

/**
 * Acknowledge an open alert and tell every open tab at once (no waiting for the next tick).
 * 404 when the alert is unknown or already cleared.
 */
export function ackAlert(engine: SimEngine, hub: StreamHub, rawId: string, nowMs: number = Date.now()): Alert {
  const id = alertIdSchema.safeParse(rawId);
  if (!id.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid alert id");
  const alert = engine.ack(id.data, nowMs);
  if (!alert?.ackedAt) throw new ApiError(404, "NOT_FOUND", `No open alert ${id.data}`);
  hub.publishAck([{ id: alert.id, ackedAt: alert.ackedAt }]);
  return alert;
}
