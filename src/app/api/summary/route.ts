import { z } from "zod";
import { handleRoute, parseQuery } from "@/server/errors";
import { summaryWithAlerts } from "@/server/services/fleet.service";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({ alerts: z.coerce.number().int().min(0).max(500).default(50) });

/** Counts and distributions for the KPI strip and charts, plus the top open alerts. */
export const GET = handleRoute((req: Request) => summaryWithAlerts(getRuntime().engine, parseQuery(query, new URL(req.url)).alerts));
