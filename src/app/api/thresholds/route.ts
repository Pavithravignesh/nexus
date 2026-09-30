import { handleRoute, parseBody } from "@/server/errors";
import { applyThresholds, currentThresholds, resetThresholds } from "@/server/services/thresholds.service";
import { getRuntime } from "@/server/sim/runtime";
import { thresholdsSchema } from "@/shared/thresholds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The active warning/critical bounds per sensor type. */
export const GET = handleRoute(() => currentThresholds());

/** Replace all bounds; statuses re-derive now, alerts follow on the next tick, tabs get an SSE frame. */
export const PUT = handleRoute(async (req: Request) => {
  const next = await parseBody(thresholdsSchema, req);
  return applyThresholds(getRuntime(), next);
});

/** Back to the catalogue defaults (same broadcast as PUT). */
export const DELETE = handleRoute(() => resetThresholds(getRuntime()));
