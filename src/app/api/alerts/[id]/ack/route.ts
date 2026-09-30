import { handleRoute } from "@/server/errors";
import { ackAlert } from "@/server/services/alerts.service";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Acknowledge an open alert; the ack is fanned out to every stream subscriber immediately. */
export const POST = handleRoute(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { engine, hub } = getRuntime();
  return ackAlert(engine, hub, id);
});
