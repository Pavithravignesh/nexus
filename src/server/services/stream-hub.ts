import { EventEmitter } from "node:events";
import type { StreamEventName } from "@/shared/schemas/stream.schema";
import type { Thresholds } from "@/shared/thresholds";
import type { HelloFrame } from "@/shared/types";
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

  constructor(private readonly tickMs: number) {
    this.emitter.setMaxListeners(0);
  }

  publish(tick: TickResult): string {
    this.lastSeq = tick.seq;
    let chunk = encodeFrame("summary", tick.seq, tick.summary) + encodeFrame("delta", tick.seq, tick.delta);
    if (tick.alerts.raised.length || tick.alerts.cleared.length) chunk += encodeFrame("alert", tick.seq, tick.alerts);
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
    const data: HelloFrame = { serverTime: new Date(nowMs).toISOString(), seq: this.lastSeq, tickMs: this.tickMs };
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
