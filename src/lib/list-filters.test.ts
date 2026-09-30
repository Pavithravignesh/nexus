import { describe, expect, it } from "vitest";
import { buildFleet } from "@/server/sim/fleet";
import { createRng } from "@/server/sim/random";
import type { Alert } from "@/shared/types";
import { ALL_FEED_KINDS, ALL_SEVERITIES, filterAlerts, filterFeed, toggleInSet, type AlertQuery } from "./list-filters";
import type { FeedItem } from "./telemetry-store";

const devices = buildFleet(createRng(3), 20);
const at = (s: number): string => new Date(Date.UTC(2026, 8, 30, 10, 0, s)).toISOString();
const mk = (id: string, idx: number, severity: Alert["severity"], s: number, ackedAt: string | null = null, sensor: Alert["sensor"] = "co2"): Alert => ({
  id,
  deviceIdx: idx,
  deviceId: devices[idx]!.deviceId,
  sensor: severity === "OFFLINE" ? null : sensor,
  severity,
  value: severity === "OFFLINE" ? null : 1600,
  raisedAt: at(s),
  ackedAt,
});
// Already in store order: severity, then unacked before acked, then newest.
const alerts = [mk("c2", 2, "CRITICAL", 30), mk("c1", 1, "CRITICAL", 10), mk("c3", 3, "CRITICAL", 40, at(45)), mk("w1", 4, "WARNING", 50, null, "temperature"), mk("o1", 5, "OFFLINE", 20)];
const q = (patch: Partial<AlertQuery>): AlertQuery => ({ q: "", severities: new Set(ALL_SEVERITIES), ack: "all", sort: "severity", ...patch });

describe("filterAlerts", () => {
  it("keeps store order for severity sort and filters by severity", () => {
    expect(filterAlerts(alerts, devices, q({})).map((a) => a.id)).toEqual(["c2", "c1", "c3", "w1", "o1"]);
    expect(filterAlerts(alerts, devices, q({ severities: new Set(["WARNING", "OFFLINE"] as const) })).map((a) => a.id)).toEqual(["w1", "o1"]);
  });

  it("filters by acknowledgement", () => {
    expect(filterAlerts(alerts, devices, q({ ack: "acked" })).map((a) => a.id)).toEqual(["c3"]);
    expect(filterAlerts(alerts, devices, q({ ack: "open" })).map((a) => a.id)).not.toContain("c3");
  });

  it("sorts newest or oldest first", () => {
    expect(filterAlerts(alerts, devices, q({ sort: "newest" })).map((a) => a.id)).toEqual(["w1", "c3", "c2", "o1", "c1"]);
    expect(filterAlerts(alerts, devices, q({ sort: "oldest" })).map((a) => a.id)).toEqual(["c1", "o1", "c2", "c3", "w1"]);
  });

  it("searches device id, sensor label, zone key and rack", () => {
    expect(filterAlerts(alerts, devices, q({ q: devices[4]!.deviceId.toLowerCase() })).map((a) => a.id)).toEqual(["w1"]);
    expect(filterAlerts(alerts, devices, q({ q: "temp" })).map((a) => a.id)).toEqual(["w1"]);
    expect(filterAlerts(alerts, devices, q({ q: "offline" })).map((a) => a.id)).toEqual(["o1"]);
    expect(filterAlerts(alerts, devices, q({ q: devices[1]!.rack })).map((a) => a.id)).toContain("c1");
  });

  it("does not mutate the input list", () => {
    const copy = [...alerts];
    filterAlerts(alerts, devices, q({ sort: "oldest" }));
    expect(alerts).toEqual(copy);
  });
});

describe("filterFeed", () => {
  const feed: FeedItem[] = [
    { id: "a", ts: 3, kind: "acked", alert: alerts[2]! },
    { id: "b", ts: 2, kind: "cleared", alert: alerts[1]! },
    { id: "c", ts: 1, kind: "raised", alert: alerts[3]! },
  ];

  it("filters by kind, severity and search", () => {
    const all = { q: "", kinds: new Set(ALL_FEED_KINDS), severities: new Set(ALL_SEVERITIES) };
    expect(filterFeed(feed, devices, all)).toHaveLength(3);
    expect(filterFeed(feed, devices, { ...all, kinds: new Set(["raised"] as const) }).map((f) => f.id)).toEqual(["c"]);
    expect(filterFeed(feed, devices, { ...all, severities: new Set(["WARNING"] as const) }).map((f) => f.id)).toEqual(["c"]);
    expect(filterFeed(feed, devices, { ...all, q: devices[1]!.deviceId }).map((f) => f.id)).toEqual(["b"]);
  });
});

describe("toggleInSet", () => {
  it("toggles members but never empties the set", () => {
    expect([...toggleInSet(new Set(["a", "b"]), "a")]).toEqual(["b"]);
    expect([...toggleInSet(new Set(["b"]), "a")].sort()).toEqual(["a", "b"]);
    expect([...toggleInSet(new Set(["b"]), "b")]).toEqual(["b"]);
  });
});
