import { handleRoute } from "@/server/errors";
import { recentDeviceEvents } from "@/server/services/events.service";
import { deviceDetail, requireDeviceIdx } from "@/server/services/fleet.service";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One device: metadata, current state of all ten sensors, open alert and recent events. */
export const GET = handleRoute(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const engine = getRuntime().engine;
  const idx = requireDeviceIdx(engine, id);
  return deviceDetail(engine, idx, await recentDeviceEvents(id));
});
