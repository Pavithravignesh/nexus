"use client";

import { useNow, useTopic } from "@/hooks/useTelemetry";
import { SENSORS, sensorIndex } from "@/shared/sensors";
import type { Insight } from "@/shared/types";
import { ago } from "../status";

const ROWS = 8;

function eta(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

function num(v: number, decimals: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * The anomaly detector's watch list: readings still inside their alarm bounds that are far
 * from their learned normal or forecast to breach soon. An early warning ahead of the alerts.
 */
export function InsightsPanel({ onOpen, matches }: { onOpen: (idx: number) => void; matches: (idx: number) => boolean }): React.JSX.Element {
  const store = useTopic("insights");
  const now = useNow();
  const frame = store.insights;
  const items = (frame?.items ?? []).filter((x) => matches(x.deviceIdx)).slice(0, ROWS);

  return (
    <section aria-label="Predictive insights" className="panel flex min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="ptitle">Predictive insights</h2>
        <span className="hint" title="Each reading learns its own normal (EWMA mean, variance and trend). Flags readings still inside their alarm bounds that deviate ≥ 4σ or are on course to cross the warning bound within 5 minutes.">
          {frame ? `${frame.flagged} readings flagged · online anomaly detection` : "learning each sensor's normal…"}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{frame ? "No early warnings for this view." : "Warming up: the detector needs a few readings per sensor."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="num w-full text-[11px]">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">Device</th>
                <th className="pr-3 font-normal">Sensor</th>
                <th className="pr-3 text-right font-normal">Now</th>
                <th className="pr-3 text-right font-normal">Normal</th>
                <th className="pr-3 text-right font-normal">σ</th>
                <th className="pr-3 text-right font-normal">Trend / min</th>
                <th className="pr-3 font-normal">Forecast</th>
                <th className="text-right font-normal">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <Row key={`${x.deviceIdx}-${x.sensor}`} x={x} now={now} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ x, now, onOpen }: { x: Insight; now: number; onOpen: (idx: number) => void }): React.JSX.Element {
  const s = SENSORS[sensorIndex(x.sensor)];
  const d = s?.decimals ?? 0;
  const soon = x.etaSec !== null;
  const color = soon ? "var(--st-warning)" : "var(--accent-2)";
  return (
    <tr className="border-t border-[var(--hairline)] hover:bg-[var(--wash)]">
      <td className="py-1 pr-3">
        <button type="button" onClick={() => onOpen(x.deviceIdx)} className="text-left hover:underline">
          {x.deviceId}
        </button>
      </td>
      <td className="pr-3">{s?.label ?? x.sensor}</td>
      <td className="pr-3 text-right">
        {num(x.value, d)} <span className="text-muted">{s?.unit}</span>
      </td>
      <td className="pr-3 text-right text-muted">{num(x.expected, d)}</td>
      <td className="pr-3 text-right" style={{ color }}>
        {x.z > 0 ? "+" : ""}
        {x.z.toFixed(1)}
      </td>
      <td className="pr-3 text-right">
        {x.trendPerMin > 0 ? "+" : ""}
        {num(x.trendPerMin, d + 1)}
      </td>
      <td className="pr-3" style={{ color }}>
        {soon ? `▲ warning in ~${eta(x.etaSec ?? 0)}` : "◆ unusual deviation"}
      </td>
      <td className="text-right text-muted">{ago(Date.parse(x.since), now)}</td>
    </tr>
  );
}
