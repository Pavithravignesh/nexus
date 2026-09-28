import { handleRoute, parseQuery } from "@/server/errors";
import { deviceHistory, historyQuerySchema, requireDeviceIdx } from "@/server/services/fleet.service";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Recent time series for a device: ?sensor=co2&window=300 (seconds). All sensors when sensor is omitted. */
export const GET = handleRoute(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const engine = getRuntime().engine;
  return deviceHistory(engine, requireDeviceIdx(engine, id), parseQuery(historyQuerySchema, new URL(req.url)), Date.now());
});
