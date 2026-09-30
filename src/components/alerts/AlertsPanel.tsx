"use client";

import { useNow, useTopic } from "@/hooks/useTelemetry";
import { SENSORS, sensorIndex } from "@/shared/sensors";
import type { Alert } from "@/shared/types";
import { SEVERITY_CODE, STATUS_UI, ago, fmt } from "../status";

function describe(a: Alert): { title: string; detail: string } {
  if (!a.sensor) return { title: "Offline", detail: "no report for 30 s" };
  const s = SENSORS[sensorIndex(a.sensor)];
  const bound = s && ("hi" in s && a.value !== null && a.value >= s.hi[0] ? s.hi : "lo" in s ? s.lo : undefined);
  const limit = bound ? (a.severity === "CRITICAL" ? bound[1] : bound[0]) : null;
  const op = s && "hi" in s && a.value !== null && a.value >= s.hi[0] ? ">" : "<";
  return { title: s?.label ?? a.sensor, detail: `${a.value !== null ? fmt(a.value) : "—"} ${s?.unit ?? ""}${limit !== null ? ` ${op} ${fmt(limit)}` : ""}` };
}

export function AlertsPanel({ onOpen, matches }: { onOpen: (idx: number) => void; matches: (idx: number) => boolean }): React.JSX.Element {
  const store = useTopic("alerts");
  const now = useNow();
  const list = store.alerts.filter((a) => matches(a.deviceIdx));
  const crit = list.filter((a) => a.severity === "CRITICAL").length;
  const warn = list.filter((a) => a.severity === "WARNING").length;

  return (
    <section aria-label="Live alerts" className="panel flex min-h-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="ptitle">Live alerts</h2>
        <span aria-live="polite" className="num text-xs text-muted">
          <span className="text-critical">{fmt(crit)} critical</span> · <span className="text-warning">{fmt(warn)} warning</span>
        </span>
      </div>
      {!store.loaded ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No open alerts for this view. The fleet is healthy.</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1" style={{ maxHeight: 300 }}>
          {list.slice(0, 40).map((a) => {
            const ui = STATUS_UI[SEVERITY_CODE[a.severity]];
            const d = describe(a);
            const dev = store.devices[a.deviceIdx];
            return (
              // Only just-raised alerts animate: Chrome restarts a CSS animation whenever React
              // moves the element, and the list reorders every tick.
              <li key={a.id} className={now - Date.parse(a.raisedAt) < 1500 ? "slidein" : undefined}>
                <button type="button" onClick={() => onOpen(a.deviceIdx)} className="grid w-full grid-cols-[4px_1fr_auto] items-center gap-3 border border-border bg-[var(--wash)] py-2 pr-3 text-left hover:bg-[var(--wash-strong)]">
                  <span aria-hidden className="self-stretch" style={{ background: ui.color, boxShadow: `0 0 10px ${ui.color}` }} />
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
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 border-t border-border pt-2">
        <h3 className="hint mb-1 uppercase">Activity feed</h3>
        <ul className="num flex flex-col gap-0.5 text-[11px] text-muted">
          {store.feed.slice(0, 8).map((f) => (
            <li key={f.id} className="truncate">
              <span style={{ color: f.kind === "cleared" ? "var(--st-normal)" : STATUS_UI[SEVERITY_CODE[f.alert.severity]].color }}>
                {new Date(f.ts).toLocaleTimeString("en-GB")} {f.kind.toUpperCase().padEnd(8)}
              </span>{" "}
              {f.alert.deviceId} {f.alert.sensor ?? "offline"} {f.alert.value ?? ""}
            </li>
          ))}
          {store.feed.length === 0 && <li>Waiting for the first transitions…</li>}
        </ul>
      </div>
    </section>
  );
}
