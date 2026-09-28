"use client";

import { scaleLinear } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useLive, useNow, useRow } from "@/hooks/useTelemetry";
import { fetchJson } from "@/lib/api";
import { historySchema } from "@/shared/schemas/api.schema";
import { SENSORS, SENSOR_COUNT, roundFor, sensorAt } from "@/shared/sensors";
import { OFFLINE, readingStatus, type StatusCode } from "@/shared/status";
import { STATUS_UI, StatusBadge, ago } from "../status";

type Point = { t: number; v: number };
const h = 220;
const pad = { l: 44, r: 12, t: 12, b: 22 };
const eventsSchema = z.object({ events: z.array(z.object({ id: z.string(), kind: z.string(), severity: z.string(), sensor: z.string().nullable(), value: z.number().nullable(), ts: z.string() })) });

function TimeSeries({ idx, deviceId, sensor }: { idx: number; deviceId: string; sensor: number }): React.JSX.Element {
  const { store } = useLive();
  const s = sensorAt(sensor);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(460);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let off = false;
    fetchJson(`/api/devices/${deviceId}/history?sensor=${s.key}&window=300`, historySchema)
      .then((h) => !off && setPoints((h.series[s.key] ?? []).map((p) => ({ t: Date.parse(p.ts), v: p.value }))))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [deviceId, s.key]);

  // Append live readings from the stream: subscribe to this device row and extend the series.
  useEffect(
    () =>
      store.subscribeRow(idx, () => {
        const seen = store.lastSeen[idx] ?? 0;
        const v = roundFor(sensor, store.values[idx * SENSOR_COUNT + sensor] ?? 0);
        setPoints((p) => (p && (p.at(-1)?.t ?? 0) < seen ? [...p.slice(-299), { t: seen, v }] : p));
      }),
    [store, idx, sensor],
  );

  const chart = useMemo(() => {
    if (!points?.length) return null;
    const bounds = [...(s.hi ?? []), ...(s.lo ?? [])];
    const vs = points.map((p) => p.v);
    let mn = Math.min(...vs, ...bounds.filter((b) => Math.abs(b - vs[0]!) < Math.abs(vs[0]!) * 0.6 + 5));
    let mx = Math.max(...vs, ...bounds.filter((b) => Math.abs(b - vs[0]!) < Math.abs(vs[0]!) * 0.6 + 5));
    const span = mx - mn || 1;
    mn -= span * 0.1;
    mx += span * 0.1;
    const x = scaleLinear().domain([points[0]!.t, points.at(-1)!.t || points[0]!.t + 1]).range([pad.l, width - pad.r]);
    const y = scaleLinear().domain([mn, mx]).range([h - pad.b, pad.t]);
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const band = (from: number, to: number): { y: number; h: number } | null => {
      const a = y(Math.min(mx, Math.max(from, to)));
      const b = y(Math.max(mn, Math.min(from, to)));
      return b > a ? { y: a, h: b - a } : null;
    };
    const bands: { k: 1 | 2; r: { y: number; h: number } | null; line: number }[] = [];
    if (s.hi) bands.push({ k: 1, r: band(s.hi[0], s.hi[1]), line: s.hi[0] }, { k: 2, r: band(s.hi[1], mx + span), line: s.hi[1] });
    if (s.lo) bands.push({ k: 1, r: band(s.lo[1], s.lo[0]), line: s.lo[0] }, { k: 2, r: band(mn - span, s.lo[1]), line: s.lo[1] });
    return { x, y, d, bands, ticks: y.ticks(4), mn, mx };
  }, [points, width, s]);

  const hp = hover !== null && points ? points[hover] : null;
  return (
    <div ref={box} className="panel">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="ptitle">
          {s.label} · {s.unit} · last 5 min
        </h3>
        <span className="num text-xs text-muted">{hp ? `${new Date(hp.t).toLocaleTimeString("en-GB")} · ${hp.v} ${s.unit} · ${STATUS_UI[readingStatus(sensor, hp.v)].label}` : "hover to inspect"}</span>
      </div>
      {failed ? (
        <p className="py-16 text-center text-sm text-muted">History is unavailable right now.</p>
      ) : !chart ? (
        <div className="skeleton h-[220px]" />
      ) : (
        <svg
          width={width}
          height={h}
          role="img"
          aria-label={`${s.label} over the last 5 minutes`}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const t = chart.x.invert(e.clientX - r.left);
            let best = 0;
            points!.forEach((p, i) => {
              if (Math.abs(p.t - t) < Math.abs(points![best]!.t - t)) best = i;
            });
            setHover(best);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {chart.bands.map((b, i) =>
            b.r ? <rect key={i} x={pad.l} width={width - pad.l - pad.r} y={b.r.y} height={b.r.h} fill={STATUS_UI[b.k].color} opacity={0.1} /> : null,
          )}
          {chart.bands.map((b, i) =>
            b.line > chart.mn && b.line < chart.mx ? (
              <g key={`l${i}`}>
                <line x1={pad.l} x2={width - pad.r} y1={chart.y(b.line)} y2={chart.y(b.line)} stroke={STATUS_UI[b.k].color} strokeDasharray="4 4" />
                <text x={width - pad.r - 2} y={chart.y(b.line) - 4} textAnchor="end" fontSize={10} fill={STATUS_UI[b.k].color} className="num">
                  {b.k === 2 ? "crit" : "warn"} {b.line}
                </text>
              </g>
            ) : null,
          )}
          {chart.ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={chart.y(t)} y2={chart.y(t)} stroke="var(--border)" strokeDasharray="2 4" />
              <text x={pad.l - 6} y={chart.y(t) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)" className="num">
                {t}
              </text>
            </g>
          ))}
          <path d={chart.d} fill="none" stroke="var(--accent)" strokeWidth={2} style={{ filter: "drop-shadow(0 0 4px var(--accent))" }} />
          {hp && (
            <>
              <line x1={chart.x(hp.t)} x2={chart.x(hp.t)} y1={pad.t} y2={h - pad.b} stroke="var(--text)" opacity={0.35} />
              <circle cx={chart.x(hp.t)} cy={chart.y(hp.v)} r={4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
            </>
          )}
          <text x={pad.l} y={h - 5} fontSize={10} fill="var(--text-muted)" className="num">
            -5m
          </text>
          <text x={width - pad.r} y={h - 5} fontSize={10} fill="var(--text-muted)" textAnchor="end" className="num">
            now
          </text>
        </svg>
      )}
    </div>
  );
}

export function DeviceDrawer({ idx, onClose }: { idx: number; onClose: () => void }): React.JSX.Element {
  const store = useRow(idx);
  const now = useNow();
  const d = store.devices[idx];
  const st = (store.status[idx] ?? 0) as StatusCode;
  const [sensor, setSensor] = useState(() => {
    let w = 0;
    for (let j = 0; j < SENSOR_COUNT; j++) if ((store.readingStatus[idx * SENSOR_COUNT + j] ?? 0) > (store.readingStatus[idx * SENSOR_COUNT + w] ?? 0)) w = j;
    return w;
  });
  const [events, setEvents] = useState<z.infer<typeof eventsSchema>["events"] | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!d) return;
    let off = false;
    fetchJson(`/api/devices/${d.deviceId}`, eventsSchema)
      .then((r) => !off && setEvents(r.events))
      .catch(() => !off && setEvents([]));
    return () => {
      off = true;
    };
  }, [d, st]);

  if (!d) return <></>;
  const ui = STATUS_UI[st];
  return (
    <>
      <div className="fixed inset-0 z-[55] bg-black/60" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={`Device ${d.deviceId}`} style={{ background: "var(--surface)" }} className="slidein fixed top-0 right-0 bottom-0 z-[60] flex w-full max-w-[560px] flex-col gap-3 overflow-y-auto border-l border-border p-4 shadow-2xl">
        <div className="border p-3" style={{ borderColor: `color-mix(in srgb, ${ui.color} 50%, transparent)`, background: `color-mix(in srgb, ${ui.color} 10%, transparent)` }}>
          <div className="flex items-start justify-between">
            <StatusBadge code={st} />
            <button ref={closeRef} type="button" onClick={onClose} className="num border border-border px-2 py-0.5 text-xs text-muted hover:text-text">
              Esc ✕
            </button>
          </div>
          <h2 className="num mt-2 text-xl font-semibold">
            {d.deviceId} <span className="font-sans text-sm font-medium text-muted">{d.type}</span>
          </h2>
          <p className="text-xs text-muted">
            {d.site} › Floor {d.floor} › Zone {d.zone} › Room {d.room} › {d.rack} · last seen {ago(store.lastSeen[idx] ?? 0, now)} ago
          </p>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {SENSORS.map((s, j) => {
            const r = st === OFFLINE ? 3 : ((store.readingStatus[idx * SENSOR_COUNT + j] ?? 0) as StatusCode);
            const color = r ? STATUS_UI[r].color : "var(--text)";
            return (
              <button key={s.key} type="button" onClick={() => setSensor(j)} aria-pressed={sensor === j} className="border border-border p-2 text-left hover:bg-white/5" style={sensor === j ? { outline: "2px solid var(--accent)", outlineOffset: -2 } : undefined}>
                <div className="text-[10px] tracking-wider text-muted uppercase">{s.label}</div>
                <div className="num text-sm" style={{ color }}>
                  {st === OFFLINE ? "—" : roundFor(j, store.values[idx * SENSOR_COUNT + j] ?? 0)} <span className="text-[10px] text-muted">{s.unit}</span>
                </div>
              </button>
            );
          })}
        </div>

        <TimeSeries key={`${idx}-${sensor}`} idx={idx} deviceId={d.deviceId} sensor={sensor} />

        <div className="panel">
          <h3 className="ptitle mb-2">Device timeline</h3>
          {events === null ? (
            <div className="skeleton h-16" />
          ) : events.length === 0 ? (
            <p className="text-sm text-muted">No recorded transitions yet. Healthy device.</p>
          ) : (
            <ul className="num flex flex-col gap-1 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="text-muted">{new Date(e.ts).toLocaleTimeString("en-GB")}</span>
                  <span>{e.kind}</span>
                  <span>
                    {e.sensor ?? ""} {e.value ?? ""} ({e.severity})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
