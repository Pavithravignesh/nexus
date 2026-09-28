import { logger } from "@/server/logger";
import type { StreamHub } from "@/server/services/stream-hub";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Serverless hosts cap a function (Vercel: 300 s); the stream then ends and EventSource reconnects. */
export const maxDuration = 300;

const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();

/**
 * Server-Sent Events: hello on connect, then summary + delta (+ alert) every tick, and a
 * comment heartbeat so idle proxies keep the connection open. The connection subscribes to
 * the shared hub; it never owns a simulator timer. `retry:` tells EventSource how long to
 * wait before reconnecting.
 */
export function streamResponse(hub: StreamHub, signal: AbortSignal, nowMs: () => number = Date.now): Response {
  const log = logger.child({ route: "stream" });
  let cleanup = (): void => {};

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string): void => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 2000\n\n${hub.hello(nowMs())}`);
      const unsubscribe = hub.subscribe(send);
      const heartbeat = setInterval(() => send(": hb\n\n"), HEARTBEAT_MS);
      let closed = false;
      cleanup = (): void => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
        log.info({ connections: hub.connections }, "sse disconnected");
      };
      signal.addEventListener("abort", cleanup, { once: true });
      log.info({ connections: hub.connections }, "sse connected");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function GET(req: Request): Response {
  return streamResponse(getRuntime().hub, req.signal);
}
