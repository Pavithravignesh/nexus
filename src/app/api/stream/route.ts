import { streamResponse } from "@/server/services/sse-response";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Serverless hosts cap a function (Vercel: 300 s); the stream then ends and EventSource reconnects. */
export const maxDuration = 300;

export function GET(req: Request): Response {
  return streamResponse(getRuntime().hub, req.signal);
}
