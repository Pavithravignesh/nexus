import { z } from "zod";
import { alertSchema } from "@/shared/schemas/stream.schema";
import type { Alert } from "@/shared/types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly reqId?: string,
  ) {
    super(message);
  }
}

const envelope = z.union([
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string(), reqId: z.string().optional() }) }),
]);

/** GET a JSON route, unwrap the { ok, data | error } envelope and validate data with a schema. */
export async function fetchJson<S extends z.ZodType>(url: string, schema: S, init?: RequestInit): Promise<z.infer<S>> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = envelope.safeParse(await res.json().catch(() => null));
  if (!body.success) throw new ApiClientError(`Unexpected response from ${url} (${res.status})`, "BAD_RESPONSE");
  if (!body.data.ok) throw new ApiClientError(body.data.error.message, body.data.error.code, body.data.error.reqId);
  const data = schema.safeParse(body.data.data);
  if (!data.success) throw new ApiClientError(`Invalid data from ${url}`, "BAD_RESPONSE");
  return data.data;
}

/** POST an alert acknowledgement; resolves with the server's copy of the acked alert. */
export function postAlertAck(id: string): Promise<Alert> {
  return fetchJson(`/api/alerts/${encodeURIComponent(id)}/ack`, alertSchema, { method: "POST" });
}

const eventsPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      deviceIdx: z.number(),
      deviceId: z.string(),
      kind: z.string(),
      severity: z.string(),
      sensor: z.string().nullable(),
      value: z.number().nullable(),
      ts: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
  available: z.boolean(),
});
export type EventsPageData = z.infer<typeof eventsPageSchema>;

/** GET /api/events: one page of persisted events, newest first, with a cursor for older ones. */
export function fetchEvents(q: { deviceId?: string; kind?: string; severity?: string; limit?: number; cursor?: string }, signal?: AbortSignal): Promise<EventsPageData> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") params.set(k, String(v));
  return fetchJson(`/api/events?${params.toString()}`, eventsPageSchema, { signal });
}
