"use client";

import { useState } from "react";
import { useTopic } from "@/hooks/useTelemetry";
import { FLOORS, ZONES, zoneKey, type Floor, type Zone } from "@/shared/fleet";
import { SENSORS, sensorIndex } from "@/shared/sensors";
import { readingStatus, zoneStatus, type StatusCode } from "@/shared/status";
import { STATUS_UI, fmt } from "../status";

/* ------------------------------------------------------------------ zone heatmap */

/** Floor × zone hexes coloured by the share-based zone roll-up. Click filters the dashboard. */
export function ZoneHeatmap({ zone, floor, onZone }: { zone: Zone | null; floor: Floor | null; onZone: (z: Zone | null, f: Floor | null) => void }): React.JSX.Element {
  const store = useTopic("summary");
  const [hover, setHover] = useState<string | null>(null);
  const s = store.summary;
  const r = 30;
  const hw = Math.sqrt(3) * r;
  const w = ZONES.length * hw + hw / 2 + 40;
  const h = FLOORS.length * r * 1.5 + r + 24;
  const hex = (cx: number, cy: number, rr: number): string =>
    Array.from({ length: 6 }, (_, j) => {
      const a = (Math.PI / 180) * (60 * j - 30);
      return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    }).join(" ");
  const hoverCounts = hover && s ? s.byZone[hover as keyof typeof s.byZone] : null;

  return (
    <section aria-label="Location health" className="panel">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="ptitle">Location health · floor × zone</h2>
        <span className="num text-xs text-muted">
          {hover && hoverCounts ? `${hover}: ${fmt(hoverCounts[2])} crit · ${fmt(hoverCounts[1])} warn · ${fmt(hoverCounts[3])} off · ${fmt(hoverCounts[0])} ok` : "hover = counts · click = filter"}
        </span>
      </div>
      {!s ? (
        <div className="skeleton h-[220px]" />
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-[220px] w-full" role="img" aria-label="Zone status map">
          {ZONES.map((z, c) => (
            <text key={z} x={40 + c * hw + hw / 4 + r * 0.9} y={12} textAnchor="middle" fontSize={11} fill="var(--text-muted)" className="num">
              {z}
            </text>
          ))}
          {FLOORS.map((f, row) => (
            <g key={f}>
              <text x={4} y={30 + r + row * r * 1.5} fontSize={11} fill="var(--text-muted)" className="num">
                F{f}
              </text>
              {ZONES.map((z, c) => {
                const key = zoneKey(z, f);
                const counts = s.byZone[key];
                const st = zoneStatus(counts);
                const color = STATUS_UI[st].color;
                const sel = zone === z && floor === f;
                const dim = (zone && zone !== z) || (floor && floor !== f);
                const cx = 40 + r + c * hw + (row % 2 ? hw / 2 : 0);
                const cy = 22 + r + row * r * 1.5;
                return (
                  <g
                    key={key}
                    className="cursor-pointer"
                    opacity={dim ? 0.35 : 1}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => (sel ? onZone(null, null) : onZone(z, f))}
                    role="button"
                    aria-label={`Zone ${z} floor ${f}: ${STATUS_UI[st].label}`}
                  >
                    <polygon points={hex(cx, cy, r - 2 + (hover === key ? 2 : 0))} fill={color} fillOpacity={st === 0 ? 0.12 : 0.32} stroke={sel ? "var(--text)" : color} strokeWidth={sel || st === 2 ? 2 : 1} strokeOpacity={st === 0 && !sel ? 0.5 : 1} />
                    {st === 2 && <polygon points={hex(cx, cy, r - 2)} fill="none" stroke={color} className="animate-pulse" />}
                    <text x={cx} y={cy - 2} textAnchor="middle" fontSize={11} fill="var(--text)" className="num">
                      {key}
                    </text>
                    <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill={st ? color : "var(--text-muted)"} className="num">
                      {st === 0 ? fmt(counts[0]) : `${fmt(counts[st])} ${STATUS_UI[st].icon}`}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ breach radar */

/** Warning + critical readings per sensor type on a radar. Click a sensor to filter devices breaching it. */
export function BreachRadar({ sensor, onSensor }: { sensor: number | null; onSensor: (s: number | null) => void }): React.JSX.Element {
  const store = useTopic("summary");
  const [hover, setHover] = useState<number | null>(null);
  const s = store.summary;
  const size = 240;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const R = 82;
  const n = SENSORS.length;
  const ang = (i: number): number => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const data = s ? SENSORS.map((x) => s.bySensor[x.key]) : [];
  const tot = data.map((d) => d.warning + d.critical);
  const max = Math.max(20, ...tot) * 1.1;
  const pt = (i: number, v: number): [number, number] => [cx + (R * v * Math.cos(ang(i))) / max, cy + (R * v * Math.sin(ang(i))) / max];
  const focus = hover ?? sensor;

  return (
    <section aria-label="Sensor breaches" className="panel">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="ptitle">Sensor breach radar</h2>
        <span className="num text-xs text-muted">{focus !== null && data[focus] ? `${SENSORS[focus]?.label}: ${fmt(data[focus].warning)} warn · ${fmt(data[focus].critical)} crit` : "click a sensor = filter"}</span>
      </div>
      {!s ? (
        <div className="skeleton h-[230px]" />
      ) : (
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[230px] w-full" role="img" aria-label="Breaches per sensor type">
          {[1, 2, 3, 4].map((l) => (
            <polygon key={l} points={SENSORS.map((_, i) => `${cx + ((R * l) / 4) * Math.cos(ang(i))},${cy + ((R * l) / 4) * Math.sin(ang(i))}`).join(" ")} fill="none" stroke="var(--border)" />
          ))}
          <polygon points={tot.map((v, i) => pt(i, v).join(",")).join(" ")} fill="var(--accent)" fillOpacity={0.16} stroke="var(--accent)" strokeWidth={2} style={{ filter: "drop-shadow(0 0 4px var(--accent))" }} />
          <polygon points={data.map((d, i) => pt(i, d.critical).join(",")).join(" ")} fill="var(--st-critical)" fillOpacity={0.22} stroke="var(--st-critical)" strokeWidth={1.5} />
          {SENSORS.map((x, i) => {
            const on = focus === i;
            const [px, py] = pt(i, tot[i] ?? 0);
            const lx = cx + (R + 20) * Math.cos(ang(i));
            const ly = cy + (R + 20) * Math.sin(ang(i));
            return (
              <g key={x.key} className="cursor-pointer" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onSensor(sensor === i ? null : i)} role="button" aria-label={`${x.label}: ${tot[i]} breaching`}>
                <line x1={cx} y1={cy} x2={cx + R * Math.cos(ang(i))} y2={cy + R * Math.sin(ang(i))} stroke={on ? "var(--accent)" : "var(--border)"} strokeWidth={on ? 2 : 1} />
                <circle cx={px} cy={py} r={on ? 5 : 3.5} fill={(data[i]?.critical ?? 0) > 0 ? "var(--st-critical)" : "var(--accent)"} />
                <circle cx={lx} cy={ly - 3} r={14} fill="transparent" />
                <text x={lx} y={ly + 1} textAnchor="middle" fontSize={10} fill={on ? "var(--text)" : "var(--text-muted)"} fontWeight={sensor === i ? 700 : 400}>
                  {x.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ fleet gauges */

const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const p = (a: number): string => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  return `M${p(a0)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
};

const GAUGES = [
  { key: "temperature" as const, min: 10, max: 45 },
  { key: "co2" as const, min: 300, max: 2000 },
  { key: "humidity" as const, min: 0, max: 100 },
];

/** Fleet averages over online devices against their warning/critical arcs. */
export function FleetGauges(): React.JSX.Element {
  const store = useTopic("summary");
  const s = store.summary;
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  return (
    <section aria-label="Fleet averages" className="panel">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="ptitle">Fleet averages</h2>
        <span className="hint">online devices · threshold arcs</span>
      </div>
      {!s ? (
        <div className="skeleton h-[220px]" />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {GAUGES.map((g) => {
            const j = sensorIndex(g.key);
            const sensor = SENSORS[j]!;
            const hi = "hi" in sensor ? sensor.hi : null;
            const v = s.averages[g.key];
            const f = (x: number): number => a0 + ((Math.min(g.max, Math.max(g.min, x)) - g.min) / (g.max - g.min)) * (a1 - a0);
            const st = readingStatus(j, v) as StatusCode;
            const c = st ? STATUS_UI[st].color : "var(--accent)";
            return (
              <svg key={g.key} viewBox="0 0 160 170" className="h-[220px] w-full" role="img" aria-label={`Average ${sensor.label} ${v} ${sensor.unit}`}>
                <path d={arc(80, 82, 60, a0, a1)} fill="none" stroke="var(--border)" strokeWidth={9} strokeLinecap="round" />
                {hi && <path d={arc(80, 82, 60, f(hi[0]), f(hi[1]))} fill="none" stroke="var(--st-warning)" strokeOpacity={0.4} strokeWidth={9} />}
                {hi && <path d={arc(80, 82, 60, f(hi[1]), a1)} fill="none" stroke="var(--st-critical)" strokeOpacity={0.4} strokeWidth={9} />}
                <path d={arc(80, 82, 60, a0, f(v))} fill="none" stroke={c} strokeWidth={9} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${c})`, transition: "d .6s" }} />
                <text x={80} y={88} textAnchor="middle" fontSize={22} fontWeight={600} fill="var(--text)" className="num">
                  {v >= 100 ? fmt(v) : v.toFixed(1)}
                </text>
                <text x={80} y={106} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                  {sensor.unit}
                </text>
                <text x={80} y={160} textAnchor="middle" fontSize={12} fill="var(--text)" letterSpacing=".08em">
                  AVG {sensor.label.toUpperCase()}
                </text>
              </svg>
            );
          })}
        </div>
      )}
    </section>
  );
}
