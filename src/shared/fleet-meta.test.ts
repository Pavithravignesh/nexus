import { describe, expect, it } from "vitest";
import { buildFleet } from "@/server/sim/fleet";
import { createRng } from "@/server/sim/random";
import { SITE } from "./fleet";
import { decodeFleetMeta, encodeFleetMeta } from "./fleet-meta";

describe("fleet meta codec", () => {
  const devices = buildFleet(createRng(42), 500);

  it("round-trips every device exactly", () => {
    expect(decodeFleetMeta(encodeFleetMeta(devices, SITE))).toEqual(devices);
  });

  it("is much smaller than the object form", () => {
    const compact = JSON.stringify(encodeFleetMeta(devices, SITE)).length;
    expect(compact).toBeLessThan(JSON.stringify(devices).length / 4);
  });
});
