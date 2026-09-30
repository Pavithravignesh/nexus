import { describe, expect, it } from "vitest";
import { ApiError } from "../errors";
import { SimEngine } from "../sim/engine";
import { ackAlert } from "./alerts.service";
import { StreamHub } from "./stream-hub";

const T0 = Date.UTC(2026, 8, 28, 10);

describe("ackAlert", () => {
  const setup = (): { engine: SimEngine; hub: StreamHub; chunks: string[] } => {
    const engine = new SimEngine({ seed: 6, nowMs: T0, changeRatio: 0.1, offlineAfterMs: 30_000, size: 400 });
    const hub = new StreamHub(1000);
    const chunks: string[] = [];
    hub.subscribe((c) => chunks.push(c));
    return { engine, hub, chunks };
  };

  it("acks the open alert and fans the ack out on the hub", () => {
    const { engine, hub, chunks } = setup();
    const target = engine.alerts()[0];
    if (!target) throw new Error("fixture has no alerts");
    const out = ackAlert(engine, hub, target.id, T0 + 500);
    expect(out.ackedAt).toBe(new Date(T0 + 500).toISOString());
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("event: alert\n");
    expect(chunks[0]).toContain(`"acked":[{"id":"${target.id}"`);
  });

  it("throws NOT_FOUND for an alert that is not open, and publishes nothing", () => {
    const { engine, hub, chunks } = setup();
    expect(() => ackAlert(engine, hub, "ALR-missing")).toThrow(ApiError);
    try {
      ackAlert(engine, hub, "ALR-missing");
    } catch (err) {
      expect(err).toMatchObject({ status: 404, code: "NOT_FOUND" });
    }
    expect(chunks).toHaveLength(0);
  });
});
