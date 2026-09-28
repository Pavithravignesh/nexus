import { z } from "zod";

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
