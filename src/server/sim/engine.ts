import { SENSORS, SENSOR_COUNT, SENSOR_KEYS, roundFor } from "@/shared/sensors";
import { NORMAL, OFFLINE, STATUS_NAMES, deviceStatus, readingStatus, worstSensor, type StatusCode } from "@/shared/status";
import { summarize } from "@/shared/summarize";
import type { Alert, AlertFrame, AlertSeverity, DeltaFrame, DeltaRow, EventKind, FleetState, Summary, TelemetryEvent } from "@/shared/types";
import { buildFleet } from "./fleet";
import { HistoryRing } from "./history";
import { createRng, type Rng } from "./random";

export type EngineOptions = {
  seed: number;
  nowMs: number;
  /** Share of devices that report in a tick (devices silent for REPORT_AT_LEAST_MS always report). */
  changeRatio: number;
  offlineAfterMs: number;
  size?: number;
  sampleEveryMs?: number;
  historyCapacity?: number;
};

export type TickResult = {
  seq: number;
  nowMs: number;
  summary: Summary;
  delta: DeltaFrame;
  alerts: AlertFrame;
  events: TelemetryEvent[];
};

// Tuning for a believable fleet: ~95% normal, a few hundred warnings, dozens critical.
const REPORT_AT_LEAST_MS = 8000;
const INITIAL_OFFLINE_SHARE = 0.038;
const GO_OFFLINE_P = 0.0006;
const COME_BACK_P = 0.02; // with GO_OFFLINE_P: equilibrium ~3% silent, most long enough to show OFFLINE
const ANOMALIES_PER_TICK = 4;
const SEVERE_SHARE = 0.25;
/** A gap this long between ticks means the process was paused (e.g. a frozen serverless instance). */
const PAUSE_GAP_MS = 5000;

/**
 * The fleet simulator. One instance ticks all 10,000 devices; SSE connections never own a
 * timer. Pure apart from the injected clock value and seeded rng, so tests drive it directly.
 */
export class SimEngine {
  readonly state: FleetState;
  readonly history: HistoryRing;
  private readonly rng: Rng;
  private readonly baseline: Float32Array;
  private readonly anomaly: Int16Array;
  private readonly offline: Uint8Array;
  private readonly openAlerts = new Map<number, Alert>();
  private readonly dirty = new Set<number>();
  private pendingEvents: TelemetryEvent[] = [];
  private eventSeq = 0;
  /** Distinguishes ids across server restarts; events are persisted, so ids must never repeat. */
  private readonly bootId: string;
  private lastSampleMs: number;
  private lastStepMs: number;
  private seqNo = 0;
  private summaryNow: Summary;

  constructor(private readonly opts: EngineOptions) {
    this.rng = createRng(opts.seed);
    this.bootId = opts.nowMs.toString(36);
    const devices = buildFleet(this.rng, opts.size);
    const n = devices.length;
    this.state = {
      devices,
      status: new Uint8Array(n),
      readingStatus: new Uint8Array(n * SENSOR_COUNT),
      values: new Float32Array(n * SENSOR_COUNT),
      lastSeen: new Float64Array(n),
    };
    this.baseline = new Float32Array(n * SENSOR_COUNT);
    this.anomaly = new Int16Array(n * SENSOR_COUNT);
    this.offline = new Uint8Array(n);
    this.history = new HistoryRing(n, opts.historyCapacity ?? 150);

    const now = opts.nowMs;
    for (let i = 0; i < n; i++) {
      this.state.lastSeen[i] = now - this.rng.range(0, 3000);
      if (this.rng.next() < INITIAL_OFFLINE_SHARE) {
        this.offline[i] = 1;
        this.state.lastSeen[i] = now - this.rng.range(opts.offlineAfterMs + 1000, 300_000);
      }
      for (let j = 0; j < SENSOR_COUNT; j++) {
        const s = SENSORS[j];
        if (!s) continue;
        const b = s.nominal + this.rng.gauss() * s.jitter * 4;
        this.baseline[i * SENSOR_COUNT + j] = b;
        this.state.values[i * SENSOR_COUNT + j] = b;
      }
    }
    const initialAnomalies = Math.round(260 * (n / 10_000));
    for (let k = 0; k < initialAnomalies; k++) this.startAnomaly(this.rng.int(n), this.rng.next() < 0.2);
    for (let p = 0; p < n * SENSOR_COUNT; p++) this.state.readingStatus[p] = readingStatus(p % SENSOR_COUNT, this.state.values[p] ?? 0);

    const iso = new Date(now).toISOString();
    for (let i = 0; i < n; i++) {
      const st = deviceStatus(this.state.readingStatus, i, this.state.lastSeen[i] ?? 0, now, opts.offlineAfterMs);
      this.state.status[i] = st;
      if (st !== NORMAL) this.openAlerts.set(i, this.makeAlert(i, st, iso));
    }
    this.lastSampleMs = now;
    this.lastStepMs = now;
    this.history.push(this.state.values, now);
    this.summaryNow = summarize(this.state, { seq: 0, nowMs: now, reporting: 0 });
  }

  get seq(): number {
    return this.seqNo;
  }

  get summary(): Summary {
    return this.summaryNow;
  }

  /** Open alerts, critical first then newest. */
  alerts(): Alert[] {
    const rank = { CRITICAL: 0, WARNING: 1, OFFLINE: 2 } as const;
    return [...this.openAlerts.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || b.raisedAt.localeCompare(a.raisedAt));
  }

  /**
   * Acknowledge an open alert. Idempotent: a second ack keeps the first ackedAt and records
   * no new event. Returns null when no open alert has that id (unknown or already cleared).
   */
  ack(alertId: string, nowMs: number = Date.now()): Alert | null {
    for (const [idx, alert] of this.openAlerts) {
      if (alert.id !== alertId) continue;
      if (alert.ackedAt) return alert;
      const iso = new Date(nowMs).toISOString();
      const acked: Alert = { ...alert, ackedAt: iso };
      this.openAlerts.set(idx, acked);
      this.pendingEvents.push({ ...this.makeEvent(idx, "acked", NORMAL, alert.sensor, alert.value, iso), severity: alert.severity });
      return acked;
    }
    return null;
  }

  alertFor(idx: number): Alert | undefined {
    return this.openAlerts.get(idx);
  }

  deltaRow(idx: number): DeltaRow {
    const base = idx * SENSOR_COUNT;
    const vals: number[] = [];
    for (let j = 0; j < SENSOR_COUNT; j++) vals.push(roundFor(j, this.state.values[base + j] ?? 0));
    return [idx, this.state.status[idx] ?? 0, this.state.lastSeen[idx] ?? 0, ...vals];
  }

  step(nowMs: number): TickResult {
    const { state, rng, opts } = this;
    const n = state.devices.length;
    const seq = ++this.seqNo;
    // Treat a long gap as paused time, not silence: shift every lastSeen forward so a resumed
    // instance does not mark the whole fleet OFFLINE on its first tick.
    const gap = nowMs - this.lastStepMs;
    if (gap > PAUSE_GAP_MS) {
      const shift = gap - 1000; // keep one tick of real elapsed time
      for (let i = 0; i < n; i++) state.lastSeen[i] = (state.lastSeen[i] ?? 0) + shift;
      this.lastSampleMs += shift;
    }
    this.lastStepMs = nowMs;
    const touched = new Set<number>();

    for (let k = 0; k < ANOMALIES_PER_TICK; k++) if (rng.next() < 0.9) this.startAnomaly(rng.int(n), rng.next() < SEVERE_SHARE);

    let reporting = 0;
    for (let i = 0; i < n; i++) {
      if (this.offline[i]) {
        if (rng.next() >= COME_BACK_P) continue;
        this.offline[i] = 0;
      } else if (rng.next() < GO_OFFLINE_P) {
        this.offline[i] = 1;
        continue;
      }
      if (rng.next() > opts.changeRatio && nowMs - (state.lastSeen[i] ?? 0) < REPORT_AT_LEAST_MS) continue;
      state.lastSeen[i] = nowMs;
      for (let j = 0; j < SENSOR_COUNT; j++) {
        const p = i * SENSOR_COUNT + j;
        const jitter = SENSORS[j]?.jitter ?? 0;
        const v = state.values[p] ?? 0;
        const left = this.anomaly[p] ?? 0;
        if (left > 0) {
          this.anomaly[p] = left - 1;
          state.values[p] = v + rng.gauss() * jitter * 1.5;
        } else {
          state.values[p] = v + ((this.baseline[p] ?? v) - v) * 0.25 + rng.gauss() * jitter;
        }
        state.readingStatus[p] = readingStatus(j, state.values[p] ?? 0);
      }
      reporting++;
      touched.add(i);
      this.dirty.add(i);
    }

    const iso = new Date(nowMs).toISOString();
    const raised: Alert[] = [];
    const cleared: string[] = [];
    const events: TelemetryEvent[] = [];
    for (let i = 0; i < n; i++) {
      const prev = (state.status[i] ?? NORMAL) as StatusCode;
      const next = deviceStatus(state.readingStatus, i, state.lastSeen[i] ?? 0, nowMs, opts.offlineAfterMs);
      if (prev === next) continue;
      state.status[i] = next;
      touched.add(i);
      const old = this.openAlerts.get(i);
      if (old) {
        cleared.push(old.id);
        this.openAlerts.delete(i);
      }
      if (prev === OFFLINE) events.push(this.makeEvent(i, "online", next, null, null, iso));
      if (next === NORMAL) {
        if (prev !== OFFLINE) events.push(this.makeEvent(i, "cleared", NORMAL, old?.sensor ?? null, null, iso));
        continue;
      }
      const alert = this.makeAlert(i, next, iso);
      this.openAlerts.set(i, alert);
      raised.push(alert);
      events.push(this.makeEvent(i, next === OFFLINE ? "offline" : "raised", next, alert.sensor, alert.value, iso));
    }
    this.pendingEvents.push(...events);

    if (nowMs - this.lastSampleMs >= (opts.sampleEveryMs ?? 2000)) {
      this.history.push(state.values, nowMs);
      this.lastSampleMs = nowMs;
    }

    this.summaryNow = summarize(state, { seq, nowMs, reporting });
    return {
      seq,
      nowMs,
      summary: this.summaryNow,
      delta: { seq, ts: iso, rows: [...touched].map((i) => this.deltaRow(i)) },
      alerts: { seq, raised, cleared, acked: [] },
      events,
    };
  }

  /**
   * Re-derive every reading status from current values against the active thresholds.
   * Device statuses, alerts and events are left alone: the next step() transitions them as
   * usual, so a threshold change produces the same raised/cleared frames as a value change.
   */
  applyThresholds(): void {
    const { values, readingStatus: rs } = this.state;
    for (let p = 0; p < rs.length; p++) {
      const next = readingStatus(p % SENSOR_COUNT, values[p] ?? 0);
      if (rs[p] === next) continue;
      rs[p] = next;
      this.dirty.add(Math.floor(p / SENSOR_COUNT)); // stored reading statuses must follow too
    }
  }

  /** Hand the persistence layer everything that changed since the last call, then forget it. */
  takeDirty(): { idxs: number[]; events: TelemetryEvent[] } {
    const out = { idxs: [...this.dirty], events: this.pendingEvents };
    this.dirty.clear();
    this.pendingEvents = [];
    return out;
  }

  private startAnomaly(idx: number, severe: boolean): void {
    const j = this.rng.int(SENSOR_COUNT);
    const s = SENSORS[j];
    if (!s) return;
    const bound = "hi" in s ? s.hi : s.lo;
    const dir = "hi" in s ? 1 : -1;
    const [warn, crit] = bound;
    const target = severe ? crit + dir * Math.abs(crit - warn) * this.rng.range(0.1, 0.6) : warn + (crit - warn) * this.rng.range(0.15, 0.85);
    const p = idx * SENSOR_COUNT + j;
    this.anomaly[p] = 3 + this.rng.int(10);
    this.state.values[p] = target;
  }

  private makeAlert(idx: number, st: StatusCode, iso: string): Alert {
    const d = this.state.devices[idx];
    const w = worstSensor(this.state.readingStatus, idx);
    const isOffline = st === OFFLINE;
    return {
      id: `ALR-${this.bootId}-${this.seqNo}-${idx}`,
      deviceIdx: idx,
      deviceId: d?.deviceId ?? "",
      sensor: isOffline ? null : (SENSOR_KEYS[w] ?? null),
      severity: STATUS_NAMES[st] as AlertSeverity,
      value: isOffline ? null : roundFor(w, this.state.values[idx * SENSOR_COUNT + w] ?? 0),
      raisedAt: iso,
      ackedAt: null,
    };
  }

  private makeEvent(idx: number, kind: EventKind, st: StatusCode, sensor: Alert["sensor"], value: number | null, iso: string): TelemetryEvent {
    return { id: `EVT-${this.bootId}-${++this.eventSeq}`, deviceIdx: idx, deviceId: this.state.devices[idx]?.deviceId ?? "", kind, severity: STATUS_NAMES[st], sensor, value, ts: iso };
  }
}
