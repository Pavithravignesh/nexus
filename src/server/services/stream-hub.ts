import { EventEmitter } from "node:events";
import type { StreamEventName } from "@/shared/schemas/stream.schema";
import type { Thresholds } from "@/shared/thresholds";
import type { AlertAck, AlertFrame, HelloFrame } from "@/shared/types";
import type { TickResult } from "../sim/engine";

export function encodeFrame(event: StreamEventName, id: number, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type Listener = (chunk: string) => void;

/**
 * In-process fan-out. Each tick is serialized ONCE and the same string is written to every
 * SSE connection, so 10 open tabs cost one JSON.stringify, not ten.
 */
export class StreamHub {
  private readonly emitter = new EventEmitter();
  private lastSeq = 0;

  constructor(
    private readonly tickMs: number,
    private readonly windows: { staleAfterMs: number; offlineAfterMs: number } = { staleAfterMs: 10_000, offlineAfterMs: 30_000 },
  ) {
    this.emitter.setMaxListeners(0);
  }

  publish(tick: TickResult): string {
    this.lastSeq = tick.seq;
    // The live client count rides on the summary so every tab can show it without polling.
    let chunk = encodeFrame("summary", tick.seq, { ...tick.summary, clients: this.connections }) + encodeFrame("delta", tick.seq, tick.delta);
    if (tick.alerts.raised.length || tick.alerts.cleared.length || tick.alerts.acked.length) chunk += encodeFrame("alert", tick.seq, tick.alerts);
    this.emitter.emit("frame", chunk);
    return chunk;
  }

  /** Fan out acknowledgements now, not on the next tick, as an `alert` frame at the current seq. */
  publishAck(acked: AlertAck[]): string {
    const frame: AlertFrame = { seq: this.lastSeq, raised: [], cleared: [], acked };
    const chunk = encodeFrame("alert", this.lastSeq, frame);
    this.emitter.emit("frame", chunk);
    return chunk;
  }

  /** Out-of-band frame: every open tab switches to the new alarm rules at once. */
  publishThresholds(t: Thresholds): string {
    const chunk = encodeFrame("thresholds", this.lastSeq, t);
    this.emitter.emit("frame", chunk);
    return chunk;
  }

  hello(nowMs: number): string {
    const data: HelloFrame = { serverTime: new Date(nowMs).toISOString(), seq: this.lastSeq, tickMs: this.tickMs, ...this.windows };
    return encodeFrame("hello", this.lastSeq, data);
  }

  subscribe(listener: Listener): () => void {
    this.emitter.on("frame", listener);
    return () => {
      this.emitter.off("frame", listener);
    };
  }

  get connections(): number {
    return this.emitter.listenerCount("frame");
  }
}
