import { z } from "zod";
import { ZONE_KEYS, type ZoneKey } from "../fleet";
import { SENSOR_COUNT, SENSOR_KEYS } from "../sensors";
import { STATUS_NAMES } from "../status";
import { thresholdsSchema } from "../thresholds";
import type { Alert, AlertFrame, DeltaFrame, HelloFrame, Summary } from "../types";

// SSE wire schemas. The browser parses every frame with these; `satisfies` pins each schema
// to the hand-written type in types.ts so the two cannot drift.

const isoDate = z.iso.datetime();
const count = z.number().int().nonnegative();
const sensorKey = z.enum(SENSOR_KEYS);

export const helloSchema = z.object({
  serverTime: isoDate,
  seq: count,
  tickMs: z.number().int().positive(),
}) satisfies z.ZodType<HelloFrame>;

export const summarySchema = z.object({
  ts: isoDate,
  seq: count,
  total: count,
  reporting: count,
  byStatus: z.record(z.enum(STATUS_NAMES), count),
  bySensor: z.record(sensorKey, z.object({ warning: count, critical: count })),
  byZone: z.record(z.enum(ZONE_KEYS as [ZoneKey, ...ZoneKey[]]), z.tuple([count, count, count, count])),
  averages: z.object({ temperature: z.number(), humidity: z.number(), co2: z.number() }),
}) satisfies z.ZodType<Summary>;

export const deltaRowSchema = z
  .tuple([count, z.number().int().min(0).max(3), z.number()], z.number().nullable())
  .refine((r) => r.length === 3 + SENSOR_COUNT, { message: `a delta row carries exactly ${SENSOR_COUNT} values` });

export const deltaFrameSchema = z.object({
  seq: count,
  ts: isoDate,
  rows: z.array(deltaRowSchema),
}) satisfies z.ZodType<DeltaFrame>;

export const alertSchema = z.object({
  id: z.string().min(1),
  deviceIdx: count,
  deviceId: z.string().regex(/^DEV-\d{5}$/),
  sensor: sensorKey.nullable(),
  severity: z.enum(["WARNING", "CRITICAL", "OFFLINE"]),
  value: z.number().nullable(),
  raisedAt: isoDate,
  ackedAt: isoDate.nullable(),
}) satisfies z.ZodType<Alert>;

export const alertFrameSchema = z.object({
  seq: count,
  raised: z.array(alertSchema),
  cleared: z.array(z.string()),
  acked: z.array(z.object({ id: z.string().min(1), ackedAt: isoDate })),
}) satisfies z.ZodType<AlertFrame>;

/** Event names on the stream, mapped to the schema that validates their data. */
export const streamEvents = {
  hello: helloSchema,
  summary: summarySchema,
  delta: deltaFrameSchema,
  alert: alertFrameSchema,
  thresholds: thresholdsSchema,
} as const;

export type StreamEventName = keyof typeof streamEvents;
