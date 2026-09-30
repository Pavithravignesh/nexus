import { SENSORS, sensorIndex } from "@/shared/sensors";
import type { Alert, AlertSeverity, DeviceMeta } from "@/shared/types";
import type { FeedItem } from "./telemetry-store";

// Local filters for the alert list and the activity feed (on top of the dashboard-wide
// device filter). Pure so they are unit tested.

export type AckFilter = "all" | "open" | "acked";
export type AlertSort = "severity" | "newest" | "oldest";
export type AlertQuery = { q: string; severities: ReadonlySet<AlertSeverity>; ack: AckFilter; sort: AlertSort };

export const ALL_SEVERITIES: readonly AlertSeverity[] = ["CRITICAL", "WARNING", "OFFLINE"];
const RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, OFFLINE: 2 };

/** Search text for an alert: device id, sensor key and label, zone key, rack, severity. */
function alertText(a: Alert, d: DeviceMeta | undefined): string {
  const label = a.sensor ? (SENSORS[sensorIndex(a.sensor)]?.label ?? a.sensor) : "offline";
  return [a.deviceId, a.sensor ?? "", label, a.severity, d ? `${d.zone}${d.floor}` : "", d?.rack ?? ""].join(" ").toLowerCase();
}

export function filterAlerts(alerts: readonly Alert[], devices: readonly DeviceMeta[], query: AlertQuery): Alert[] {
  const q = query.q.trim().toLowerCase();
  const out = alerts.filter((a) => {
    if (!query.severities.has(a.severity)) return false;
    if (query.ack === "open" && a.ackedAt !== null) return false;
    if (query.ack === "acked" && a.ackedAt === null) return false;
    return !q || alertText(a, devices[a.deviceIdx]).includes(q);
  });
  if (query.sort === "severity") return out; // the store already keeps severity > unacked > newest
  const dir = query.sort === "newest" ? -1 : 1;
  return out.sort((a, b) => a.raisedAt.localeCompare(b.raisedAt) * dir || RANK[a.severity] - RANK[b.severity]);
}

export type FeedKind = FeedItem["kind"];
export const ALL_FEED_KINDS: readonly FeedKind[] = ["raised", "cleared", "acked"];
export type FeedQuery = { q: string; kinds: ReadonlySet<FeedKind>; severities: ReadonlySet<AlertSeverity> };

export function filterFeed(feed: readonly FeedItem[], devices: readonly DeviceMeta[], query: FeedQuery): FeedItem[] {
  const q = query.q.trim().toLowerCase();
  return feed.filter((f) => query.kinds.has(f.kind) && query.severities.has(f.alert.severity) && (!q || alertText(f.alert, devices[f.alert.deviceIdx]).includes(q)));
}

/** Toggle one member of a filter set, but never leave it empty (empty would hide everything). */
export function toggleInSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next.size ? next : new Set(set);
}
