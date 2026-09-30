import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { logger } from "./logger";

export type ErrorCode = "NOT_FOUND" | "VALIDATION_FAILED" | "INTERNAL";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string; reqId: string; details?: unknown } };

/** Parse a query string with zod, turning failures into a 400 with the flattened issues. */
export function parseQuery<S extends z.ZodType>(schema: S, url: URL): z.infer<S> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid query", parsed.error.flatten().fieldErrors);
  return parsed.data;
}

/** Parse a JSON request body with zod; bad JSON or a schema failure is a 400 listing each issue by path. */
export async function parseBody<S extends z.ZodType>(schema: S, req: Request): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "VALIDATION_FAILED", "Body is not valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new ApiError(400, "VALIDATION_FAILED", "Invalid body", issues);
  }
  return parsed.data;
}

/**
 * Wrap a JSON route handler: request id, one completion log line, and the
 * { ok, data } | { ok, error } envelope. Unknown errors become 500 with the message hidden.
 */
export function handleRoute<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<unknown> | unknown) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const reqId = randomUUID().slice(0, 8);
    const started = performance.now();
    const path = new URL(req.url).pathname;
    let status = 200;
    let body: Envelope<unknown>;
    try {
      body = { ok: true, data: await fn(req, ctx) };
    } catch (err) {
      const known = err instanceof ApiError;
      status = known ? err.status : 500;
      body = {
        ok: false,
        error: known ? { code: err.code, message: err.message, reqId, details: err.details } : { code: "INTERNAL", message: "Something went wrong", reqId },
      };
      if (!known) logger.error({ err, reqId, path }, "unhandled route error");
    }
    logger.info({ reqId, method: req.method, path, status, durationMs: Math.round(performance.now() - started) }, "request");
    return Response.json(body, { status, headers: { "x-request-id": reqId, "cache-control": "no-store" } });
  };
}
