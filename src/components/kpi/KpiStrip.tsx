"use client";

import { useTopic } from "@/hooks/useTelemetry";
import type { StatusCode } from "@/shared/status";
import type { TrendPoint } from "@/lib/telemetry-store";
import { fmt } from "../status";

function Sparkline({ data, color }: { data: number[]; color: string }): React.JSX.Element | null {
  if (data.length < 2) return null;
  const w = 120;
  const h = 36;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const r = mx - mn || 1;
  const d = data.map((v, i) => `${i ? "L" : "M"}${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - mn) / r) * (h - 6)).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-x-3 bottom-2 h-7 w-[calc(100%-1.5rem)]" preserveAspectRatio="none" aria-hidden>
      <path d={`${d}L${w},${h}L0,${h}Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Card = { key: string; label: string; color: string; filter: StatusCode | null; value: (t: TrendPoint) => number; sub: (t: TrendPoint, prev: TrendPoint | undefined) => string };

const delta = (now: number, prev: number | undefined): string => (prev === undefined ? "live" : `${now >= prev ? "▲" : "▼"} ${fmt(Math.abs(now - prev))} in 60 s`);

const CARDS: Card[] = [
  { key: "total", label: "Total devices", color: "var(--accent)", filter: null, value: (t) => t.normal + t.warning + t.critical + t.offline, sub: () => "10 sensor types · 24 zones" },
  { key: "normal", label: "Normal", color: "var(--st-normal)", filter: 0, value: (t) => t.normal, sub: (t) => `${((t.normal / (t.normal + t.warning + t.critical + t.offline)) * 100).toFixed(1)}% of fleet` },
  { key: "warning", label: "Warning", color: "var(--st-warning)", filter: 1, value: (t) => t.warning, sub: (t, p) => delta(t.warning, p?.warning) },
  { key: "critical", label: "Critical", color: "var(--st-critical)", filter: 2, value: (t) => t.critical, sub: (t, p) => delta(t.critical, p?.critical) },
  { key: "offline", label: "Offline", color: "var(--st-offline)", filter: 3, value: (t) => t.offline, sub: (t, p) => delta(t.offline, p?.offline) },
  { key: "rate", label: "Reporting / tick", color: "var(--accent-2)", filter: null, value: (t) => t.reporting, sub: () => "devices per 1 s delta" },
];

export function KpiStrip({ status, onStatus }: { status: StatusCode | null; onStatus: (s: StatusCode | null) => void }): React.JSX.Element {
  const store = useTopic("summary");
  const trend = store.trend;
  const last = trend.at(-1);
  const prev = trend.at(-61);
  return (
    <section aria-label="Fleet KPIs" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {CARDS.map((c) => {
        const selected = c.filter !== null && status === c.filter;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onStatus(c.filter === null || selected ? null : c.filter)}
            aria-pressed={selected}
            className="panel min-h-32 cursor-pointer text-left transition-transform hover:-translate-y-0.5"
            style={{ paddingBottom: 44, ...(selected ? { outline: `2px solid ${c.color}`, outlineOffset: -2 } : {}) }}
          >
            <div className="flex items-center gap-2 text-xs tracking-[.12em] text-muted uppercase">
              <span aria-hidden className="h-2 w-2" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
              {c.label}
            </div>
            {last ? (
              <>
                <div className="num mt-1.5 text-3xl font-semibold" style={{ textShadow: `0 0 18px color-mix(in srgb, ${c.color} 40%, transparent)` }}>
                  {fmt(c.value(last))}
                </div>
                <div className="mt-1 truncate text-xs text-muted">{c.sub(last, prev)}</div>
                <Sparkline data={trend.slice(-60).map(c.value)} color={c.color} />
              </>
            ) : (
              <div className="skeleton mt-3 h-9 w-24" />
            )}
          </button>
        );
      })}
    </section>
  );
}
