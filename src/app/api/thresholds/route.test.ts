import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamHub } from "@/server/services/stream-hub";
import { SimEngine } from "@/server/sim/engine";
import type { Runtime } from "@/server/sim/runtime";
import { DEFAULT_THRESHOLDS, getThresholds, setThresholds, type Thresholds } from "@/shared/thresholds";
import { DELETE, GET, PUT } from "./route";

// A small runtime instead of the real 10,000-device singleton with its timers.
const rt = vi.hoisted(() => ({ current: null as Runtime | null }));
vi.mock("@/server/sim/runtime", () => ({
  getRuntime: (): Runtime => {
    if (!rt.current) throw new Error("runtime not set up");
    return rt.current;
  },
}));

const url = "http://localhost/api/thresholds";
const put = (body: string): Request => new Request(url, { method: "PUT", body, headers: { "content-type": "application/json" } });
type Body = { ok: boolean; data?: Thresholds; error?: { code: string; details?: { path: string }[] } };

function setup(): { frames: string[]; saved: Thresholds[] } {
  const engine = new SimEngine({ seed: 2, nowMs: Date.UTC(2026, 8, 28, 10), changeRatio: 0.1, offlineAfterMs: 30_000, size: 20 });
  const hub = new StreamHub(1000);
  const frames: string[] = [];
  const saved: Thresholds[] = [];
  hub.subscribe((c) => frames.push(c));
  rt.current = { engine, hub, startedAt: 0, onFlush: null, onThresholds: async (t) => void saved.push(t), stop: () => {} };
  return { frames, saved };
}

afterEach(() => {
  setThresholds(DEFAULT_THRESHOLDS);
  rt.current = null;
});

describe("/api/thresholds", () => {
  it("GET returns the active thresholds", async () => {
    const res = await GET(new Request(url), {});
    expect(((await res.json()) as Body).data).toEqual(DEFAULT_THRESHOLDS);
  });

  it("PUT rejects invalid bounds with VALIDATION_FAILED and changes nothing", async () => {
    const { frames } = setup();
    const res = await PUT(put(JSON.stringify({ ...DEFAULT_THRESHOLDS, co2: { hi: [1500, 1000] } })), {});
    const body = (await res.json()) as Body;
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    expect(body.error?.details?.map((d) => d.path)).toEqual(["co2.hi"]);
    expect(getThresholds()).toBe(DEFAULT_THRESHOLDS);
    expect(frames).toHaveLength(0);
  });

  it("PUT rejects a body that is not JSON", async () => {
    setup();
    const res = await PUT(put("{nope"), {});
    expect(res.status).toBe(400);
  });

  it("PUT applies, broadcasts and saves valid thresholds", async () => {
    const { frames, saved } = setup();
    const next = { ...DEFAULT_THRESHOLDS, co2: { hi: [900, 1200] } };
    const res = await PUT(put(JSON.stringify(next)), {});
    expect(res.status).toBe(200);
    expect(((await res.json()) as Body).data).toEqual(next);
    expect(getThresholds().co2.hi).toEqual([900, 1200]);
    expect(frames[0]).toContain("event: thresholds\n");
    expect(saved).toHaveLength(1);
  });

  it("DELETE resets to defaults and broadcasts", async () => {
    const { frames } = setup();
    setThresholds({ ...DEFAULT_THRESHOLDS, co2: { hi: [900, 1200] } });
    const res = await DELETE(new Request(url, { method: "DELETE" }), {});
    expect(((await res.json()) as Body).data).toEqual(DEFAULT_THRESHOLDS);
    expect(getThresholds().co2.hi).toEqual([1000, 1500]);
    expect(frames).toHaveLength(1);
  });
});
