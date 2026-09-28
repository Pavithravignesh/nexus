import { handleRoute } from "@/server/errors";
import { latestTelemetry } from "@/server/services/fleet.service";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Latest state of every device as packed rows (same shape as SSE delta rows). The client snapshot. */
export const GET = handleRoute(() => latestTelemetry(getRuntime().engine));
