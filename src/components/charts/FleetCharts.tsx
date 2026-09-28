"use client";

import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line as d3line } from "d3-shape";
import { useEffect, useRef, useState } from "react";
import { useTopic } from "@/hooks/useTelemetry";
import type { StatusCode } from "@/shared/status";
import type { TrendPoint } from "@/lib/telemetry-store";
import { STATUS_UI, fmt } from "../status";

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const SERIES: { key: keyof TrendPoint; code: StatusCode; label: string }[] = [
  { key: "warning", code: 1, label: "Warning" },
  { key: "offline", code: 3, label: "Offline" },
  { key: "critical", code: 2, label: "Critical" },
];

/** Fleet health: warning / offline / critical counts over the last 3 minutes, live. */
export function FleetHealthChart(): React.JSX.Element {
  const store = useTopic("summary");
  const [ref, width] = useWidth();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const data = store.trend;
  const h = 230;
  const pad = { l: 40, r: 10, t: 26, b: 20 };
  const vis = SERIES.filter((s) => !hidden.has(s.key));
  const max = Math.max(10, ...data.flatMap((p) => vis.map((s) => p[s.key]))) * 1.15;
  const x = scaleLinear().domain([0, Math.max(1, data.length - 1)]).range([pad.l, width - pad.r]);
  const y = scaleLinear().domain([0, max]).range([h - pad.b, pad.t]);
  const hp = hover !== null ? data[hover] : undefined;

  return (
    <section aria-label="Fleet health" className="panel">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="ptitle">Fleet health · live</h2>
        <span className="hint">hover = inspect · legend = toggle</span>
      </div>
      <div ref={ref}>
        {width === 0 || data.length < 2 ? (
          <div className="skeleton" style={{ height: h }} />
        ) : (
          <svg
            width={width}
            height={h}
            role="img"
            aria-label="Warning, offline and critical device counts over time"
            onMouseMove={(e) => setHover(Math.max(0, Math.min(data.length - 1, Math.round(x.invert(e.clientX - e.currentTarget.getBoundingClientRect().left)))))}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`fh-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={STATUS_UI[s.code].color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={STATUS_UI[s.code].color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" />
                <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)" className="num">
                  {t}
                </text>
              </g>
            ))}
            {vis.map((s) => {
              const path = d3line<TrendPoint>()
                .x((_, i) => x(i))
                .y((p) => y(p[s.key]))
                .curve(curveMonotoneX)(data);
              if (!path) return null;
              const c = STATUS_UI[s.code].color;
              return (
                <g key={s.key}>
                  <path d={`${path}L${x(data.length - 1)},${h - pad.b}L${x(0)},${h - pad.b}Z`} fill={`url(#fh-${s.key})`} />
                  <path d={path} fill="none" stroke={c} strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
                </g>
              );
            })}
            {SERIES.map((s, i) => (
              <g key={s.key} className="cursor-pointer" opacity={hidden.has(s.key) ? 0.35 : 1} onClick={() => setHidden((hs) => { const n = new Set(hs); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}>
                <rect x={pad.l + i * 86} y={4} width={80} height={16} fill="transparent" />
                <rect x={pad.l + 2 + i * 86} y={8} width={8} height={8} fill={STATUS_UI[s.code].color} />
                <text x={pad.l + 14 + i * 86} y={16} fontSize={11} fill="var(--text)">
                  {s.label}
                </text>
              </g>
            ))}
            {hp && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} stroke="var(--text)" opacity={0.35} />
                {vis.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(hp[s.key])} r={4} fill="var(--surface)" stroke={STATUS_UI[s.code].color} strokeWidth={2} />
                ))}
                <text x={width - pad.r} y={16} textAnchor="end" fontSize={11} fill="var(--text)" className="num">
                  {new Date(hp.t).toLocaleTimeString("en-GB")} · W {fmt(hp.warning)} · C {fmt(hp.critical)} · O {fmt(hp.offline)}
                </text>
              </g>
            )}
            <text x={pad.l} y={h - 5} fontSize={10} fill="var(--text-muted)" className="num">
              -{Math.round((data.length - 1) / 60)}m
            </text>
            <text x={width - pad.r} y={h - 5} textAnchor="end" fontSize={10} fill="var(--text-muted)" className="num">
              now
            </text>
          </svg>
        )}
      </div>
    </section>
  );
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const p = (a: number): string => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  return `M${p(a0)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
};

/** Status distribution donut: hover = counts, click = filter the dashboard by that status. */
export function StatusDonut({ status, onStatus }: { status: StatusCode | null; onStatus: (s: StatusCode | null) => void }): React.JSX.Element {
  const store = useTopic("summary");
  const [hover, setHover] = useState<StatusCode | null>(null);
  const s = store.summary;
  const size = 230;
  const cx = size / 2;
  const cy = size / 2;
  const R = 90;
  const counts: [StatusCode, number][] = s ? [[0, s.byStatus.NORMAL], [1, s.byStatus.WARNING], [2, s.byStatus.CRITICAL], [3, s.byStatus.OFFLINE]] : [];
  const total = counts.reduce((a, [, n]) => a + n, 0) || 1;
  const focus = hover ?? status;
  let a = -Math.PI / 2;

  return (
    <section aria-label="Status distribution" className="panel">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="ptitle">Status distribution</h2>
        <span className="hint">click = filter</span>
      </div>
      {!s ? (
        <div className="skeleton mx-auto rounded-full" style={{ width: size - 20, height: size - 20 }} />
      ) : (
        <div className="flex items-center justify-center gap-4">
          <svg width={size} height={size} role="img" aria-label="Devices by status">
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={14} />
            {counts.map(([code, n]) => {
              const sweep = Math.max((n / total) * Math.PI * 2, 0.08);
              const d = arc(cx, cy, R, a + 0.025, a + sweep - 0.025);
              a += sweep;
              const on = focus === code;
              const c = STATUS_UI[code].color;
              return (
                <path
                  key={code}
                  d={d}
                  fill="none"
                  stroke={c}
                  strokeWidth={on ? 22 : 14}
                  opacity={status !== null && status !== code ? 0.35 : 1}
                  className="cursor-pointer transition-[stroke-width]"
                  style={{ filter: `drop-shadow(0 0 5px ${c})` }}
                  onMouseEnter={() => setHover(code)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onStatus(status === code ? null : code)}
                >
                  <title>
                    {STATUS_UI[code].label}: {fmt(n)} ({((n / total) * 100).toFixed(1)}%)
                  </title>
                </path>
              );
            })}
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={28} fontWeight={600} fill={focus !== null ? STATUS_UI[focus].color : "var(--text)"} className="num">
              {focus !== null ? fmt(counts.find(([c]) => c === focus)?.[1] ?? 0) : `${(((counts[0]?.[1] ?? 0) / total) * 100).toFixed(1)}%`}
            </text>
            <text x={cx} y={cy + 26} textAnchor="middle" fontSize={11} fill="var(--text-muted)" letterSpacing=".12em">
              {focus !== null ? STATUS_UI[focus].label : "FLEET NORMAL"}
            </text>
          </svg>
          <ul className="num flex flex-col gap-1.5 text-xs">
            {counts.map(([code, n]) => (
              <li key={code}>
                <button type="button" onClick={() => onStatus(status === code ? null : code)} className="flex items-center gap-2 hover:text-text" style={{ color: STATUS_UI[code].color }}>
                  <span aria-hidden>{STATUS_UI[code].icon}</span>
                  {fmt(n)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
