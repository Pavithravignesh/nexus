import { handleRoute, parseQuery } from "@/server/errors";
import { listDevices, listQuerySchema } from "@/server/services/fleet.service";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List/search devices: ?q=&status=&floor=&zone=&sensor=&sort=&dir=&limit=&cursor= */
export const GET = handleRoute((req: Request) => listDevices(getRuntime().engine, parseQuery(listQuerySchema, new URL(req.url))));
