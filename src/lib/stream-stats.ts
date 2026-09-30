// Measured health of the SSE stream, shown in the connection pill and its details panel.
// Nothing here is a constant: rates come from frames actually received, latency from the
// server's frame timestamps corrected by the clock offset learned from the hello frame.

const WINDOW_MS = 10_000;
/**
 * Offsets below this are treated as synced clocks: the hello-based offset also contains the
 * hello frame's own one-way delay, and subtracting that would erase the latency we measure.
 */
const SKEW_THRESHOLD_MS = 2000;

export type StreamSnapshot = {
  /** Frames (SSE events) per second over the last 10 s. */
  framesPerSec: number;
  /** Ticks (summary frames) per second over the last 10 s: should match 1000 / tickMs. */
  ticksPerSec: number;
  /** Received payload, KB per second over the last 10 s. */
  kbPerSec: number;
  /** Server stamp of the latest summary to its arrival here, clock-skew corrected; null until known. */
  latencyMs: number | null;
  totalFrames: number;
  totalBytes: number;
  reconnects: number;
  /** When the current connection opened (client clock), 0 before the first. */
  connectedAt: number;
  /** Open SSE connections on the server, from the latest summary. */
  clients: number | null;
  lastEventId: number;
};

export class StreamStats {
  private frames: { t: number; bytes: number; tick: boolean }[] = [];
  private totalFrames = 0;
  private totalBytes = 0;
  private reconnects = 0;
  private connectedAt = 0;
  private opened = false;
  /** serverClock - clientClock, learned from hello.serverTime. */
  private offsetMs = 0;
  private latencyMs: number | null = null;
  private clients: number | null = null;
  private lastEventId = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** A connection opened. Every open after the first counts as a reconnect. */
  markOpened(): void {
    if (this.opened) this.reconnects++;
    this.opened = true;
    this.connectedAt = this.now();
  }

  /** Learn the server/client clock offset from the hello frame (only real skew is corrected). */
  syncClock(serverTimeIso: string): void {
    const server = Date.parse(serverTimeIso);
    if (!Number.isFinite(server)) return;
    const raw = server - this.now();
    this.offsetMs = Math.abs(raw) > SKEW_THRESHOLD_MS ? raw : 0;
  }

  /** Record any received frame; pass the server timestamp for summaries to measure latency. */
  record(bytes: number, opts: { eventId?: number; serverTs?: string; clients?: number } = {}): void {
    const t = this.now();
    const tick = opts.serverTs !== undefined;
    this.frames.push({ t, bytes, tick });
    this.totalFrames++;
    this.totalBytes += bytes;
    if (opts.eventId !== undefined && opts.eventId > this.lastEventId) this.lastEventId = opts.eventId;
    if (opts.clients !== undefined) this.clients = opts.clients;
    if (tick) {
      const sent = Date.parse(opts.serverTs ?? "");
      if (Number.isFinite(sent)) this.latencyMs = Math.max(0, t + this.offsetMs - sent);
    }
    this.trim(t);
  }

  snapshot(): StreamSnapshot {
    const t = this.now();
    this.trim(t);
    const span = Math.min(WINDOW_MS, Math.max(1000, t - (this.frames[0]?.t ?? t))) / 1000;
    const bytes = this.frames.reduce((a, f) => a + f.bytes, 0);
    return {
      framesPerSec: this.frames.length / span,
      ticksPerSec: this.frames.filter((f) => f.tick).length / span,
      kbPerSec: bytes / 1024 / span,
      latencyMs: this.latencyMs,
      totalFrames: this.totalFrames,
      totalBytes: this.totalBytes,
      reconnects: this.reconnects,
      connectedAt: this.connectedAt,
      clients: this.clients,
      lastEventId: this.lastEventId,
    };
  }

  private trim(t: number): void {
    while (this.frames.length && (this.frames[0]?.t ?? t) < t - WINDOW_MS) this.frames.shift();
  }
}
