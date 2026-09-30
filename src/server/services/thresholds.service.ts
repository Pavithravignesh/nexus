import { DEFAULT_THRESHOLDS, getThresholds, setThresholds, type Thresholds } from "@/shared/thresholds";
import type { Runtime } from "../sim/runtime";

export type ThresholdsRuntime = Pick<Runtime, "engine" | "hub" | "onThresholds">;

export function currentThresholds(): Thresholds {
  return getThresholds();
}

/**
 * Make `t` the active alarm rules: the engine re-derives reading statuses now (alerts follow
 * on the next tick), every open tab gets a `thresholds` frame, and persistence saves it.
 * `t` must already be validated with thresholdsSchema.
 */
export function applyThresholds(rt: ThresholdsRuntime, t: Thresholds): Thresholds {
  setThresholds(t);
  rt.engine.applyThresholds();
  rt.hub.publishThresholds(t);
  void rt.onThresholds?.(t);
  return t;
}

export function resetThresholds(rt: ThresholdsRuntime): Thresholds {
  return applyThresholds(rt, DEFAULT_THRESHOLDS);
}
