import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, handleRoute, parseQuery } from "./errors";

const req = (path = "/api/x"): Request => new Request(`http://localhost${path}`);

describe("handleRoute", () => {
  it("wraps data in the ok envelope with a request id", async () => {
    const res = await handleRoute(() => ({ n: 1 }))(req(), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { n: 1 } });
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("maps ApiError to its status, code and reqId", async () => {
    const res = await handleRoute(() => {
      throw new ApiError(404, "NOT_FOUND", "Device DEV-1 not found");
    })(req(), {});
    const body = (await res.json()) as { ok: boolean; error: { code: string; message: string; reqId: string } };
    expect(res.status).toBe(404);
    expect(body.error).toMatchObject({ code: "NOT_FOUND", message: "Device DEV-1 not found" });
    expect(body.error.reqId).toBe(res.headers.get("x-request-id"));
  });

  it("hides the message of unexpected errors", async () => {
    const res = await handleRoute(() => {
      throw new Error("secret connection string");
    })(req(), {});
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(res.status).toBe(500);
    expect(body.error).toMatchObject({ code: "INTERNAL", message: "Something went wrong" });
  });
});

describe("parseQuery", () => {
  const schema = z.object({ limit: z.coerce.number().int().max(10) });

  it("coerces valid query params", () => {
    expect(parseQuery(schema, new URL("http://x/?limit=5"))).toEqual({ limit: 5 });
  });

  it("throws VALIDATION_FAILED with field errors", () => {
    try {
      parseQuery(schema, new URL("http://x/?limit=50"));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).details).toHaveProperty("limit");
    }
  });
});
