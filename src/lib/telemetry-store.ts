import { SENSOR_COUNT } from "@/shared/sensors";
import { CRITICAL, WARNING, readingStatus } from "@/shared/status";
import type { Alert, AlertFrame, DeltaFrame, DeltaRow, DeviceMeta, Summary } from "@/shared/types";

// Client-side live state. Holds the fleet in typed arrays OUTSIDE React so a tick never
// becomes 10,000 setState calls. Components subscribe to a topic (or one row) through
// useSyncExternalStore and only re-render when that topic changed; notifications are
// coalesced into one per animation frame.

export type ConnectionState = "connecting" | "live" | "stale" | "reconnecting";
export type Topic = "fleet" | "summary" | "alerts" | "connection";

export type TrendPoint = { t: number; normal: number; warning: number; critical: number; offline: number; reporting: number };
export type FeedItem = { id: string; ts: number; kind: "raised" | "cleared"; alert: Alert };

export const TREND_CAPACITY = 180;
export const FEED_CAPACITY = 60;
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

  private readonly versions: Record<Topic, number> = { fleet: 0, summary: 0, alerts: 0, connection: 0 };
  private rowVersions = new Uint32Array(0);
  private readonly listeners = new Map<Topic, Set<Listener>>();
  private readonly rowListeners = new Map<number, Set<Listener>>();
  private readonly dirtyTopics = new Set<Topic>();
  private readonly dirtyRows = new Set<number>();
  private scheduled = false;

  constructor(
    private readonly schedule: Schedule = defaultSchedule,
    private readonly now: () => number = Date.now,
  ) {}

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
    if (this.feed.length > FEED_CAPACITY) this.feed.length = FEED_CAPACITY;
    this.alerts = sortAlerts([...this.alerts.filter((a) => !cleared.has(a.id)), ...frame.raised]);
    this.touch("alerts");
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

function sortAlerts(list: Alert[]): Alert[] {
  return [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.raisedAt.localeCompare(a.raisedAt));
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
