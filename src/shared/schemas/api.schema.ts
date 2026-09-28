import { z } from "zod";
import { SENSOR_KEYS } from "../sensors";
import { alertSchema, deltaRowSchema, summarySchema } from "./stream.schema";

// Schemas for the JSON routes the browser reads.

export const fleetMetaSchema = z.object({
  site: z.string(),
  rows: z.array(z.tuple([z.number().int(), z.number().int(), z.number().int(), z.string(), z.string()])),
});

export const latestSchema = z.object({ seq: z.number().int(), ts: z.string(), rows: z.array(deltaRowSchema) });

export const summaryResponseSchema = z.object({ summary: summarySchema, alerts: z.array(alertSchema), openAlerts: z.number().int() });

export const historySchema = z.object({
  deviceId: z.string(),
  series: z.partialRecord(z.enum(SENSOR_KEYS), z.array(z.object({ ts: z.string(), value: z.number() }))),
});
