"use client";

import { useState } from "react";
import { useNow, useTopic } from "@/hooks/useTelemetry";
import { postAlertAck } from "@/lib/api";
import { ALL_SEVERITIES, filterAlerts, toggleInSet, type AckFilter, type AlertSort } from "@/lib/list-filters";
import { paginate } from "@/lib/pagination";
import { SENSORS, sensorIndex } from "@/shared/sensors";
import { boundsFor } from "@/shared/thresholds";
import type { Alert, AlertSeverity } from "@/shared/types";
import { SEVERITY_CODE, STATUS_UI, ago, fmt } from "../status";
import { Chip, MiniSelect, SearchInput } from "../ui/ListControls";
import { Pagination } from "../ui/Pagination";

function describe(a: Alert, offlineAfterMs: number): { title: string; detail: string } {
  if (!a.sensor) return { title: "Offline", detail: `no report for ${Math.round(offlineAfterMs / 1000)} s` };
  const j = sensorIndex(a.sensor);
  const s = SENSORS[j];
  const { hi, lo } = boundsFor(j);
  const high = hi !== undefined && a.value !== null && a.value >= hi[0];
  const bound = high ? hi : lo;
  const limit = bound ? (a.severity === "CRITICAL" ? bound[1] : bound[0]) : null;
  const op = high ? ">" : "<";
  return { title: s?.label ?? a.sensor, detail: `${a.value !== null ? fmt(a.value) : "—"} ${s?.unit ?? ""}${limit !== null ? ` ${op} ${fmt(limit)}` : ""}` };
}

const ACK_OPTIONS = [
  { value: "all", label: "Any ack state" },
  { value: "open", label: "Unacknowledged" },
  { value: "acked", label: "Acknowledged" },
] as const satisfies readonly { value: AckFilter; label: string }[];
const SORT_OPTIONS = [
  { value: "severity", label: "Severity first" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const satisfies readonly { value: AlertSort; label: string }[];

/** Open alerts for the dashboard filter, with their own search, severity/ack filters, sort and pages. */
export function AlertsPanel({ onOpen, matches }: { onOpen: (idx: number) => void; matches: (idx: number) => boolean }): React.JSX.Element {
  const store = useTopic("alerts");
  const now = useNow();
  const [q, setQ] = useState("");
  const [severities, setSeverities] = useState<ReadonlySet<AlertSeverity>>(new Set(ALL_SEVERITIES));
  const [ackFilter, setAckFilter] = useState<AckFilter>("all");
  const [sort, setSort] = useState<AlertSort>("severity");
  const [size, setSize] = useState(10);
  const [pageState, setPageState] = useState({ view: "", page: 0 });

  const inView = store.alerts.filter((a) => matches(a.deviceIdx));
  const list = filterAlerts(inView, store.devices, { q, severities, ack: ackFilter, sort });
  // The page belongs to one set of alert filters; changing any of them starts at page 1.
  const view = `${q}|${[...severities].join()}|${ackFilter}|${sort}|${size}`;
  const page = paginate(list, pageState.view === view ? pageState.page : 0, size);
  const critAll = inView.filter((a) => a.severity === "CRITICAL");
  const critAcked = critAll.filter((a) => a.ackedAt !== null).length;
  const counts: Record<AlertSeverity, number> = {
    CRITICAL: critAll.length,
    WARNING: inView.filter((a) => a.severity === "WARNING").length,
    OFFLINE: inView.filter((a) => a.severity === "OFFLINE").length,
  };

  const ack = (id: string): void => {
    store.ackLocally(id);
    postAlertAck(id).catch((err: unknown) => console.warn("alert ack failed", id, err));
  };

  return (
    <section aria-label="Live alerts" className="panel flex min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="ptitle">Live alerts</h2>
        <span aria-live="polite" className="num text-xs text-muted">
          <span className="text-critical">
            {fmt(critAll.length - critAcked)} critical{critAcked > 0 && <span className="text-muted"> ({fmt(critAcked)} acked)</span>}
          </span>{" "}
          · <span className="text-warning">{fmt(counts.WARNING)} warning</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <SearchInput value={q} onChange={setQ} label="Search alerts" placeholder="Device, sensor, zone, rack…" />
        {ALL_SEVERITIES.map((s) => (
          <Chip key={s} on={severities.has(s)} color={STATUS_UI[SEVERITY_CODE[s]].color} onClick={() => setSeverities((set) => toggleInSet(set, s))}>
            {STATUS_UI[SEVERITY_CODE[s]].icon} {s.slice(0, 4)} {fmt(counts[s])}
          </Chip>
        ))}
        <MiniSelect label="Acknowledgement" value={ackFilter} options={ACK_OPTIONS} onChange={setAckFilter} />
        <MiniSelect label="Sort alerts" value={sort} options={SORT_OPTIONS} onChange={setSort} />
      </div>

      {!store.loaded ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{inView.length === 0 ? "No open alerts for this view. The fleet is healthy." : "No alerts match these alert filters."}</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1" style={{ maxHeight: 330 }}>
          {page.items.map((a) => {
            const ui = STATUS_UI[SEVERITY_CODE[a.severity]];
            const d = describe(a, store.offlineAfterMs);
            const dev = store.devices[a.deviceIdx];
            const acked = a.ackedAt !== null;
            return (
              // Only just-raised alerts animate: Chrome restarts a CSS animation whenever React
              // moves the element, and the list reorders every tick.
              <li
                key={a.id}
                className={`${now - Date.parse(a.raisedAt) < 1500 ? "slidein " : ""}grid grid-cols-[4px_1fr_auto] items-stretch gap-3 border border-border bg-[var(--wash)] pr-3 hover:bg-[var(--wash-strong)]`}
                style={acked ? { opacity: 0.55 } : undefined}
              >
                <span aria-hidden style={{ background: ui.color, boxShadow: acked ? undefined : `0 0 10px ${ui.color}` }} />
                <button type="button" onClick={() => onOpen(a.deviceIdx)} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 text-left">
                  <span>
                    <span className="block text-sm">
                      <b className="mr-1.5 font-semibold" style={{ color: ui.color }}>
                        {ui.icon} {d.title}
                      </b>
                      <span className="num text-xs">{d.detail}</span>
                    </span>
                    <span className="num block text-[11px] text-muted">
                      {a.deviceId} · F{dev?.floor} › Zone {dev?.zone} › {dev?.rack}
                    </span>
                  </span>
                  <span className="num text-[11px] text-muted">{ago(Date.parse(a.raisedAt), now)}</span>
                </button>
                <span className="flex items-center">
                  {acked ? (
                    <span className="num text-[10px] text-muted" title={`Acknowledged ${new Date(a.ackedAt ?? "").toLocaleTimeString("en-GB")}`}>
                      ✓ ACK
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => ack(a.id)}
                      aria-label={`Acknowledge ${d.title} alert on ${a.deviceId}`}
                      className="num border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted hover:bg-[var(--wash)] hover:text-[var(--text)]"
                    >
                      Ack
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} size={size} sizes={[10, 25, 50]} label="Alerts" onPage={(p) => setPageState({ view, page: p })} onSize={setSize} />
    </section>
  );
}
