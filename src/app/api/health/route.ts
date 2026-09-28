import { pingDb } from "@/server/db/client";
import { handleRoute } from "@/server/errors";
import { persistenceStatus } from "@/server/services/persistence";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async () => {
  const rt = getRuntime();
  const mongo = await pingDb();
  return {
    ok: true,
    uptimeS: Math.round((Date.now() - rt.startedAt) / 1000),
    seq: rt.engine.seq,
    devices: rt.engine.state.devices.length,
    streamConnections: rt.hub.connections,
    mongo,
    persistence: persistenceStatus,
  };
});
