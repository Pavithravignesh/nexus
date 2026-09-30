import { SENSORS, type SensorKey } from "@/shared/sensors";
import { sidesOf, thresholdsSchema, type BoundSide, type Thresholds } from "@/shared/thresholds";

// Form state for the thresholds dialog: inputs hold strings, validation is the same zod schema
// the server uses, so Save is only enabled for a set the PUT will accept.

export type Pair = [warning: string, critical: string];
export type Draft = Record<SensorKey, Partial<Record<BoundSide, Pair>>>;
export type Checked = { value: Thresholds | null; errors: Map<string, string> };

export function toDraft(t: Thresholds): Draft {
  const draft = {} as Draft;
  for (const s of SENSORS) {
    const sides: Partial<Record<BoundSide, Pair>> = {};
    for (const side of sidesOf(s.key)) {
      const pair = t[s.key][side];
      if (pair) sides[side] = [String(pair[0]), String(pair[1])];
    }
    draft[s.key] = sides;
  }
  return draft;
}

const toNum = (v: string): number => (v.trim() === "" ? NaN : Number(v));

/** Parse the draft with thresholdsSchema; errors are keyed `${sensor}.${side}`, one per pair. */
export function checkDraft(draft: Draft): Checked {
  const candidate: Record<string, Partial<Record<BoundSide, [number, number]>>> = {};
  for (const s of SENSORS) {
    const sides: Partial<Record<BoundSide, [number, number]>> = {};
    for (const side of sidesOf(s.key)) {
      const pair = draft[s.key][side];
      if (pair) sides[side] = [toNum(pair[0]), toNum(pair[1])];
    }
    candidate[s.key] = sides;
  }
  const parsed = thresholdsSchema.safeParse(candidate);
  if (parsed.success) return { value: parsed.data, errors: new Map() };
  const errors = new Map<string, string>();
  for (const issue of parsed.error.issues) {
    const key = issue.path.slice(0, 2).join(".");
    // A third path segment means one of the two numbers itself is missing or not finite.
    if (!errors.has(key)) errors.set(key, issue.path.length > 2 ? "enter a number" : issue.message);
  }
  return { value: null, errors };
}
