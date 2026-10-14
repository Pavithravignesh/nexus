import { SENSORS, SENSOR_COUNT, SENSOR_KEYS, roundFor } from "@/shared/sensors";
import { NORMAL, OFFLINE, readingStatus } from "@/shared/status";
import { boundsFor } from "@/shared/thresholds";
import type { FleetState, Insight } from "@/shared/types";

export type DetectorOptions = {
  /** EWMA weight of a new reading in the short-term mean (the centre the noise is measured around). */
  meanAlpha: number;
  /** EWMA weight of a new reading in the long-term normal that readings are scored against. */
  normalAlpha: number;
  /** The normal's weight during warm-up: fast, so a fault present at start-up washes out before scoring begins. */
  warmupNormalAlpha: number;
  /** A reading moving back toward its normal faster than this (sensor jitter per second) is recovering. */
  recoveryRate: number;
  /** EWMA weight of a new squared residual in the learned variance. */
  varAlpha: number;
  /** EWMA weight of a new rate-of-change sample in the trend. */
  trendAlpha: number;
  /** Readings a sensor must report before it can be flagged. */
  warmup: number;
  /** |z| at or above which a reading is flagged on deviation alone (and stops teaching the variance). */
  zFlag: number;
  /** |z| a reading needs before its trend is trusted for a breach forecast. */
  zWatch: number;
  /** Forecast window: a reading trending to breach within this many seconds is flagged. */
  horizonSec: number;
};

export const DEFAULT_DETECTOR: DetectorOptions = {
  meanAlpha: 0.1,
  normalAlpha: 0.01,
  warmupNormalAlpha: 0.3,
  recoveryRate: 0.2,
  varAlpha: 0.05,
  trendAlpha: 0.3,
  warmup: 20,
  zFlag: 4,
  zWatch: 3,
  horizonSec: 300,
};

/** Per-sensor noise floor for the standard deviation, so a very quiet sensor cannot flag on noise. */
const SD_FLOOR = SENSORS.map((s) => s.jitter);

/**
 * Online anomaly detection over the whole fleet. Every reading learns its own normal: a slow
 * EWMA (the long-term normal it is scored against), a fast EWMA and variance (its noise), and
 * an EWMA rate of change. State is flat typed arrays indexed like FleetState.values, so
 * 100,000 readings cost a few megabytes and one pass per tick.
 *
 * It looks for what fixed thresholds miss: a reading that is still inside its alarm bounds
 * but is either far from its own normal or trending to breach its warning bound soon.
 * Readings already breaching are left to the threshold alerts.
 */
export class AnomalyDetector {
  private readonly mean: Float32Array;
  private readonly normal: Float32Array;
  private readonly variance: Float32Array;
  private readonly trend: Float32Array;
  private readonly last: Float32Array;
  private readonly lastTs: Float64Array;
  private readonly count: Uint16Array;
  private readonly flaggedAt: Float64Array;

  constructor(
    size: number,
    private readonly opts: DetectorOptions = DEFAULT_DETECTOR,
  ) {
    this.mean = new Float32Array(size);
    this.normal = new Float32Array(size);
    this.variance = new Float32Array(size);
    this.trend = new Float32Array(size);
    this.last = new Float32Array(size);
    this.lastTs = new Float64Array(size);
    this.count = new Uint16Array(size);
    this.flaggedAt = new Float64Array(size);
  }

  /** Learn from one reported value of reading `p` (index `deviceIdx * SENSOR_COUNT + sensorIdx`). */
  observe(p: number, value: number, nowMs: number): void {
    const { opts } = this;
    const c = this.count[p] ?? 0;
    if (c === 0) {
      this.mean[p] = value;
      this.normal[p] = readingStatus(p % SENSOR_COUNT, value) === NORMAL ? value : NaN;
      this.variance[p] = 0;
      this.trend[p] = 0;
      this.last[p] = value;
      this.lastTs[p] = nowMs;
      this.count[p] = 1;
      return;
    }
    const dt = (nowMs - (this.lastTs[p] ?? nowMs)) / 1000;
    if (dt <= 0) return;
    const mean = this.mean[p] ?? value;
    const resid = value - mean;
    const sd = Math.max(Math.sqrt(this.variance[p] ?? 0), SD_FLOOR[p % SENSOR_COUNT] ?? 0);
    const rate = (value - (this.last[p] ?? value)) / dt;
    this.trend[p] = c === 1 ? rate : (this.trend[p] ?? 0) + opts.trendAlpha * (rate - (this.trend[p] ?? 0));
    // Early on, average evenly (1/n) so the first few readings are not under-weighted. Once
    // warmed up, an outlier must not teach the variance, or a drift would mask itself.
    if (c < opts.warmup || Math.abs(resid / sd) < opts.zFlag) {
      this.variance[p] = (this.variance[p] ?? 0) + Math.max(opts.varAlpha, 1 / c) * (resid * resid - (this.variance[p] ?? 0));
    }
    this.mean[p] = mean + Math.max(opts.meanAlpha, 1 / (c + 1)) * resid;
    // The long-term normal moves slowly, so a fault lasting minutes cannot redefine "normal".
    // A breaching value never teaches it, and during warm-up it tracks fast so a fault already
    // present at start-up (a fresh server instance) has washed out before scoring begins.
    if (readingStatus(p % SENSOR_COUNT, value) === NORMAL) {
      const normal = this.normal[p] ?? NaN;
      this.normal[p] = Number.isNaN(normal) ? value : normal + (c < opts.warmup ? opts.warmupNormalAlpha : opts.normalAlpha) * (value - normal);
    }
    this.last[p] = value;
    this.lastTs[p] = nowMs;
    if (c < 0xffff) this.count[p] = c + 1;
  }

  /**
   * Score every reading against the live alarm rules and return the ranked watch list: soonest
   * forecast breach first, then the largest deviation. `flagged` counts every flag, not just the top.
   */
  scan(state: FleetState, nowMs: number, limit: number): { flagged: number; items: Insight[] } {
    const bounds = SENSOR_KEYS.map((_, j) => boundsFor(j));
    const hits: Insight[] = [];
    const n = state.devices.length;
    for (let i = 0; i < n; i++) {
      const offline = state.status[i] === OFFLINE;
      for (let j = 0; j < SENSOR_COUNT; j++) {
        const p = i * SENSOR_COUNT + j;
        const hit = offline ? null : this.score(state, p, i, j, bounds[j] ?? {});
        if (!hit) {
          this.flaggedAt[p] = 0;
          continue;
        }
        if (!this.flaggedAt[p]) this.flaggedAt[p] = nowMs;
        hit.since = new Date(this.flaggedAt[p] ?? nowMs).toISOString();
        hits.push(hit);
      }
    }
    hits.sort((a, b) => (a.etaSec ?? Infinity) - (b.etaSec ?? Infinity) || Math.abs(b.z) - Math.abs(a.z));
    return { flagged: hits.length, items: hits.slice(0, limit) };
  }

  private score(state: FleetState, p: number, i: number, j: number, b: ReturnType<typeof boundsFor>): Insight | null {
    const { opts } = this;
    const key = SENSOR_KEYS[j];
    if (!key || (this.count[p] ?? 0) < opts.warmup) return null;
    // Judge the last value the device actually reported, and derive its status here: the live
    // value array can move between reports (an injected spike) before its stored status does.
    // The status is taken from the rounded value, as the wire and the browser see it.
    const value = this.last[p] ?? 0;
    if (readingStatus(j, roundFor(j, value)) !== NORMAL) return null;
    const normal = this.normal[p] ?? NaN;
    if (Number.isNaN(normal)) return null;
    const z = (value - normal) / Math.max(Math.sqrt(this.variance[p] ?? 0), SD_FLOOR[j] ?? 0);
    if (Math.abs(z) < opts.zWatch) return null;
    // Only deviations on the side of an alarm bound matter, and only while they are not on
    // their way back: a reading settling to normal after a fault is far from normal too, and
    // on a two-sided sensor (pressure) its fall must not be read as heading for the low bound.
    const up = z > 0;
    const warn = up ? b.hi?.[0] : b.lo?.[0];
    if (warn === undefined) return null;
    const trend = this.trend[p] ?? 0;
    const toward = up ? trend : -trend;
    if (toward < -opts.recoveryRate * (SD_FLOOR[j] ?? 0)) return null;
    const etaSec = toward > 0 ? Math.max(0, up ? warn - value : value - warn) / toward : null;
    const soon = etaSec !== null && etaSec <= opts.horizonSec;
    if (Math.abs(z) < opts.zFlag && !soon) return null;
    const decimals = (SENSORS[j]?.decimals ?? 0) + 1;
    return {
      deviceIdx: i,
      deviceId: state.devices[i]?.deviceId ?? "",
      sensor: key,
      value: roundFor(j, value),
      expected: roundFor(j, normal),
      z: Math.round(z * 10) / 10,
      trendPerMin: Math.round(trend * 60 * 10 ** decimals) / 10 ** decimals,
      etaSec: soon ? Math.round(etaSec) : null,
      since: "",
    };
  }
}
