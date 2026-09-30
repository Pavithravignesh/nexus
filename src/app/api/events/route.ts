import { handleRoute, parseQuery } from "@/server/errors";
import { eventsQuerySchema } from "@/server/repos/event-query";
import { listEvents } from "@/server/services/events.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persisted events, newest first: ?deviceId=&kind=raised,acked&severity=CRITICAL&limit=25&cursor= */
export const GET = handleRoute((req: Request) => listEvents(parseQuery(eventsQuerySchema, new URL(req.url))));
