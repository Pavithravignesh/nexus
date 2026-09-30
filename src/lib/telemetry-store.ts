import { SENSOR_COUNT } from "@/shared/sensors";
import { CRITICAL, WARNING, readingStatus } from "@/shared/status";
import type { Alert, AlertFrame, DeltaFrame, DeltaRow, DeviceMeta, HelloFrame, Summary } from "@/shared/types";
import { StreamStats } from "./stream-stats";

// Client-side live state. Holds the fleet in typed arrays OUTSIDE React so a tick never
// becomes 10,000 setState calls. Components subscribe to a topic (or one row) through
// useSyncExternalStore and only re-render when that topic changed; notifications are
// coalesced into one per animation frame.

export type ConnectionState = "connecting" | "live" | "stale" | "reconnecting";
export type Topic = "fleet" | "summary" | "alerts" | "connection" | "stream";

export type TrendPoint = { t: number; normal: number; warning: number; critical: number; offline: number; reporting: number };
export type FeedItem = { id: string; ts: number; kind: "raised" | "cleared" | "acked"; alert: Alert };

export const TREND_CAPACITY = 180;
export const FEED_CAPACITY = 500;
const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, OFFLINE: 2 } as const;

type Listener = () => void;
type Schedule = (fn: () => void) => void;

const defaultSchedule: Schedule = (fn) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else setTimeout(fn, 0);
};

export class TelemetryStore {
  devices: readonly DeviceMeta[] = [];
  status = new Uint8Array(0);
  lastSeen = new Float64Array(0);
  values = new Float32Array(0);
  readingStatus = new Uint8Array(0);
  summary: Summary | null = null;
  trend: TrendPoint[] = [];
  alerts: Alert[] = [];
  feed: FeedItem[] = [];
  connection: ConnectionState = "connecting";
  /** When the current connection state began; lets the UI ignore sub-second planned reconnects. */
  connectionSince = 0;
  /** Wall-clock time the last frame (or snapshot) arrived; drives "updated Xs ago" and stale. */
  lastFrameAt = 0;
  seq = 0;
  loaded = false;
  /** Timing rules from the server hello frame; these defaults only apply until it arrives. */
  tickMs = 1000;
  staleAfterMs = 10_000;
  offlineAfterMs = 30_000;
  readonly stats: StreamStats;

  private readonly versions: Record<Topic, number> = { fleet: 0, summary: 0, alerts: 0, connection: 0, stream: 0 };
  private rowVersions = new Uint32Array(0);
  private readonly listeners = new Map<Topic, Set<Listener>>();
  private readonly rowListeners = new Map<number, Set<Listener>>();
  private readonly dirtyTopics = new Set<Topic>();
  private readonly dirtyRows = new Set<number>();
  private scheduled = false;

  constructor(
    private readonly schedule: Schedule = defaultSchedule,
    private readonly now: () => number = Date.now,
  ) {
    this.stats = new StreamStats(now);
  }

  /** A stream connection opened and said hello: adopt the server clock and timing rules. */
  applyHello(h: HelloFrame): void {
    this.tickMs = h.tickMs;
    this.staleAfterMs = h.staleAfterMs;
    this.offlineAfterMs = h.offlineAfterMs;
    this.stats.markOpened();
    this.stats.syncClock(h.serverTime);
    this.touch("stream", "fleet");
  }

  /** Account one received SSE frame for the live stream metrics. */
  recordFrame(bytes: number, opts: { eventId?: number; serverTs?: string; clients?: number } = {}): void {
    this.stats.record(bytes, opts);
    if (opts.serverTs !== undefined) this.touch("stream");
  }

  /* ---------- writes ---------- */

  applySnapshot(snap: { devices: readonly DeviceMeta[]; rows: DeltaRow[]; seq: number; summary: Summary; alerts: Alert[] }): void {
    const n = snap.devices.length;
    this.devices = snap.devices;
    this.status = new Uint8Array(n);
    this.lastSeen = new Float64Array(n);
    this.values = new Float32Array(n * SENSOR_COUNT);
    this.readingStatus = new Uint8Array(n * SENSOR_COUNT);
    this.rowVersions = new Uint32Array(n);
    for (const r of snap.rows) this.writeRow(r);
    for (let i = 0; i < n; i++) this.dirtyRows.add(i);
    this.alerts = sortAlerts(snap.alerts);
    this.seq = snap.seq;
    this.loaded = true;
    this.applySummary(snap.summary);
    this.touch("fleet", "alerts");
  }

  applySummary(s: Summary): void {
    this.summary = s;
    this.seq = Math.max(this.seq, s.seq);
    this.lastFrameAt = this.now();
    const b = s.byStatus;
    const point: TrendPoint = { t: Date.parse(s.ts), normal: b.NORMAL, warning: b.WARNING, critical: b.CRITICAL, offline: b.OFFLINE, reporting: s.reporting };
    const last = this.trend.at(-1);
    if (last && last.t === point.t) this.trend[this.trend.length - 1] = point;
    else {
      this.trend.push(point);
      if (this.trend.length > TREND_CAPACITY) this.trend.shift();
    }
    this.touch("summary");
  }

  applyDelta(frame: DeltaFrame): void {
    if (!this.loaded) return; // the snapshot that follows contains this state
    for (const r of frame.rows) this.writeRow(r);
    this.lastFrameAt = this.now();
    if (frame.rows.length) this.touch("fleet");
  }

  applyAlerts(frame: AlertFrame): void {
    if (!this.loaded) return;
    const cleared = new Set(frame.cleared);
    const ts = this.now();
    const byId = new Map(this.alerts.map((a) => [a.id, a]));
    for (const id of cleared) {
      const a = byId.get(id);
      if (a) this.feed.unshift({ id: `c-${id}`, ts, kind: "cleared", alert: a });
    }
    for (const a of frame.raised) this.feed.unshift({ id: `r-${a.id}`, ts, kind: "raised", alert: a });
    let next = [...this.alerts.filter((a) => !cleared.has(a.id)), ...frame.raised];
    if (frame.acked.length) {
      const acked = new Map(frame.acked.map((k) => [k.id, k.ackedAt]));
      next = next.map((a) => {
        const at = acked.get(a.id);
        if (at === undefined) return a;
        const updated = { ...a, ackedAt: at };
        // The feed line comes from the server frame (not the optimistic ack) so every tab gets exactly one.
        if (!this.feed.some((f) => f.id === `a-${a.id}`)) this.feed.unshift({ id: `a-${a.id}`, ts, kind: "acked", alert: updated });
        return updated;
      });
    }
    if (this.feed.length > FEED_CAPACITY) this.feed.length = FEED_CAPACITY;
    this.alerts = sortAlerts(next);
    this.touch("alerts");
  }

  /** Optimistic acknowledge: mark the alert acked right away; the server's `acked` frame confirms it. */
  ackLocally(id: string): void {
    let hit = false;
    const at = new Date(this.now()).toISOString();
    const next = this.alerts.map((a) => {
      if (a.id !== id || a.ackedAt) return a;
      hit = true;
      return { ...a, ackedAt: at };
    });
    if (!hit) return;
    this.alerts = sortAlerts(next);
    this.touch("alerts");
  }

  /**
   * Recompute every reading status from current values against the active thresholds (after
   * setThresholds). Device statuses and alerts stay as the server sent them until its next tick.
   * Alerts are touched too because their text quotes the bounds.
   */
  rederive(): void {
    for (let p = 0; p < this.values.length; p++) this.readingStatus[p] = readingStatus(p % SENSOR_COUNT, this.values[p] ?? 0);
    for (let i = 0; i < this.rowVersions.length; i++) {
      this.rowVersions[i] = (this.rowVersions[i] ?? 0) + 1;
      this.dirtyRows.add(i);
    }
    this.touch("fleet", "summary", "alerts");
  }

  setConnection(state: ConnectionState): void {
    if (this.connection === state) return;
    this.connection = state;
    this.connectionSince = this.now();
    this.touch("connection");
  }

  /* ---------- reads / subscriptions ---------- */

  version(topic: Topic): number {
    return this.versions[topic];
  }

  rowVersion(idx: number): number {
    return this.rowVersions[idx] ?? 0;
  }

  subscribe(topic: Topic, l: Listener): () => void {
    const set = this.listeners.get(topic) ?? new Set();
    set.add(l);
    this.listeners.set(topic, set);
    return () => set.delete(l);
  }

  subscribeRow(idx: number, l: Listener): () => void {
    const set = this.rowListeners.get(idx) ?? new Set();
    set.add(l);
    this.rowListeners.set(idx, set);
    return () => {
      set.delete(l);
      if (!set.size) this.rowListeners.delete(idx);
    };
  }

  /** Run pending notifications now (tests, and anything that must not wait a frame). */
  flush(): void {
    this.scheduled = false;
    const topics = [...this.dirtyTopics];
    const rows = [...this.dirtyRows];
    this.dirtyTopics.clear();
    this.dirtyRows.clear();
    for (const i of rows) this.rowListeners.get(i)?.forEach((l) => l());
    for (const t of topics) this.listeners.get(t)?.forEach((l) => l());
  }

  /* ---------- internals ---------- */

  private writeRow(r: DeltaRow): void {
    const [idx, st, seen] = r;
    if (idx >= this.status.length) return;
    this.status[idx] = st;
    this.lastSeen[idx] = seen;
    for (let j = 0; j < SENSOR_COUNT; j++) {
      const v = r[3 + j];
      if (v === null || v === undefined) continue;
      this.values[idx * SENSOR_COUNT + j] = v;
      this.readingStatus[idx * SENSOR_COUNT + j] = readingStatus(j, v);
    }
    this.rowVersions[idx] = (this.rowVersions[idx] ?? 0) + 1;
    this.dirtyRows.add(idx);
  }

  private touch(...topics: Topic[]): void {
    for (const t of topics) {
      this.versions[t]++;
      this.dirtyTopics.add(t);
    }
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => this.flush());
  }
}

/** Severity (critical, warning, offline), then unacknowledged before acknowledged, then newest first. */
export function sortAlerts(list: Alert[]): Alert[] {
  return [...list].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || Number(a.ackedAt !== null) - Number(b.ackedAt !== null) || b.raisedAt.localeCompare(a.raisedAt),
  );
}

/** Count of breaching readings on a device (for "worst sensor" style displays). */
export function breachCount(store: TelemetryStore, idx: number): number {
  let n = 0;
  for (let j = 0; j < SENSOR_COUNT; j++) {
    const r = store.readingStatus[idx * SENSOR_COUNT + j];
    if (r === WARNING || r === CRITICAL) n++;
  }
  return n;
}
