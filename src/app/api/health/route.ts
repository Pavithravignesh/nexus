import { pingDb } from "@/server/persistence/db/client";
import { handleRoute } from "@/server/errors";
import { persistenceStatus } from "@/server/persistence/persistence";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleRoute(async () => {
  const rt = getRuntime();
  const mongo = persistenceStatus.enabled ? await pingDb() : null;
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
