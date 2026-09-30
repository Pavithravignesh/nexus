import { z } from "zod";
import { SENSORS, SENSOR_KEYS, sensorAt, type Bound, type SensorKey } from "./sensors";

// Operator-editable alarm rules. SENSORS keeps the default bounds (and the simulator's
// physics); this module holds the bounds actually used for status derivation.

export type SensorBounds = { hi?: Bound; lo?: Bound };
export type Thresholds = Record<SensorKey, SensorBounds>;
export type BoundSide = "hi" | "lo";

function catalogueBounds(): Thresholds {
  const entries = SENSORS.map((s): [SensorKey, SensorBounds] => [s.key, { ...("hi" in s ? { hi: s.hi } : {}), ...("lo" in s ? { lo: s.lo } : {}) }]);
  return Object.fromEntries(entries) as Thresholds;
}

export const DEFAULT_THRESHOLDS: Thresholds = catalogueBounds();

/** The sides (hi, lo) a sensor has by default; an edit can move bounds but not add or drop a side. */
export function sidesOf(key: SensorKey): BoundSide[] {
  const d = DEFAULT_THRESHOLDS[key];
  return (["lo", "hi"] as const).filter((side) => d[side] !== undefined);
}

const bound = z.tuple([z.number(), z.number()]);
const sensorBounds = z.strictObject({ hi: bound.optional(), lo: bound.optional() });

function checkSensor(key: SensorKey, b: SensorBounds, ctx: z.RefinementCtx): void {
  for (const side of ["hi", "lo"] as const) {
    const expected = DEFAULT_THRESHOLDS[key][side] !== undefined;
    if (expected && !b[side]) ctx.addIssue({ code: "custom", path: [key, side], message: `${side} bound is required` });
    if (!expected && b[side]) ctx.addIssue({ code: "custom", path: [key, side], message: `${key} has no ${side} bound` });
  }
  if (b.hi && b.hi[0] >= b.hi[1]) ctx.addIssue({ code: "custom", path: [key, "hi"], message: "warning must be below critical" });
  if (b.lo && b.lo[0] <= b.lo[1]) ctx.addIssue({ code: "custom", path: [key, "lo"], message: "warning must be above critical" });
  if (b.hi && b.lo && b.hi[0] <= b.lo[0]) ctx.addIssue({ code: "custom", path: [key, "hi"], message: "high warning must be above low warning" });
}

/** A full threshold set: every sensor, the same sides as its default, bounds in a sane order. */
export const thresholdsSchema = z.record(z.enum(SENSOR_KEYS), sensorBounds).superRefine((t, ctx) => {
  for (const key of SENSOR_KEYS) checkSensor(key, t[key], ctx);
}) satisfies z.ZodType<Thresholds>;

type Active = { set: Thresholds; byIdx: SensorBounds[] };
const indexed = (set: Thresholds): Active => ({ set, byIdx: SENSOR_KEYS.map((k) => set[k]) });

// The holder lives on globalThis because Next bundles instrumentation and route handlers
// separately: the simulator and the PUT route must share one copy. It is resolved once per
// module so readingStatus (100k calls a tick) reads a local, indexed array.
const g = globalThis as typeof globalThis & { __nexusThresholds?: Active };
const active: Active = (g.__nexusThresholds ??= indexed(DEFAULT_THRESHOLDS));

export function getThresholds(): Thresholds {
  return active.set;
}

export function boundsFor(sensorIdx: number): SensorBounds {
  return active.byIdx[sensorIdx] ?? DEFAULT_THRESHOLDS[sensorAt(sensorIdx).key];
}

/** Replace the active set. Callers validate first (thresholdsSchema); this does not. */
export function setThresholds(t: Thresholds): void {
  Object.assign(active, indexed(t));
}
