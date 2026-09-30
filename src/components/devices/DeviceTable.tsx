"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useLive, useRow } from "@/hooks/useTelemetry";
import { SENSOR_COUNT, roundFor, sensorAt, sensorIndex, type SensorKey } from "@/shared/sensors";
import { CRITICAL, OFFLINE, WARNING, worstSensor, type StatusCode } from "@/shared/status";
import type { TelemetryStore } from "@/lib/telemetry-store";
import { STATUS_UI, StatusBadge, ago } from "../status";

const RESORT_MS = 3000;
const STALE_MS = 10_000;
const ROW_H = 34;
const VALUE_COLS: SensorKey[] = ["temperature", "humidity", "co2", "pm25", "noise"];
const GRID = "grid grid-cols-[100px_84px_96px_104px_66px_repeat(5,minmax(44px,1fr))_52px] items-center gap-1.5 px-2";

type SortKey = "severity" | "deviceId" | "lastSeen" | SensorKey;
const COLS: { key: SortKey | null; label: string }[] = [
  { key: "severity", label: "Status" },
  { key: "deviceId", label: "Device" },
  { key: null, label: "Type" },
  { key: null, label: "Location" },
  { key: null, label: "Worst" },
  ...VALUE_COLS.map((k) => ({ key: k, label: `${sensorAt(sensorIndex(k)).label} ${sensorAt(sensorIndex(k)).unit}` })),
  { key: "lastSeen", label: "Seen" },
];
const RANK = [0, 2, 3, 1]; // normal < warning < offline < critical

function sortValue(store: TelemetryStore, i: number, key: SortKey): number {
  if (key === "severity") return RANK[store.status[i] ?? 0] ?? 0;
  if (key === "deviceId") return -i;
  if (key === "lastSeen") return store.lastSeen[i] ?? 0;
  return store.values[i * SENSOR_COUNT + sensorIndex(key)] ?? 0;
}

const Row = memo(function Row({ idx, selected, active, now, onOpen }: { idx: number; selected: boolean; active: boolean; now: number; onOpen: (idx: number) => void }): React.JSX.Element {
  const store = useRow(idx);
  const d = store.devices[idx];
  const st = (store.status[idx] ?? 0) as StatusCode;
  const seen = store.lastSeen[idx] ?? 0;
  const stale = st !== OFFLINE && now - seen > STALE_MS;
  const w = worstSensor(store.readingStatus, idx);
  const breaching = st !== OFFLINE && (store.readingStatus[idx * SENSOR_COUNT + w] ?? 0) > 0;
  const version = store.rowVersion(idx);
  if (!d) return <div />;
  return (
    <button
      type="button"
      tabIndex={-1}
      id={`device-row-${idx}`}
      role="row"
      aria-selected={active}
      onClick={() => onOpen(idx)}
      className={`${GRID} num h-full w-full border-b border-[var(--hairline)] text-left text-xs hover:bg-[var(--wash)] ${selected ? "bg-accent/15" : ""}`}
      style={{ outline: active ? "2px solid var(--accent)" : undefined, outlineOffset: -2, opacity: st === OFFLINE ? 0.55 : stale ? 0.65 : 1, borderLeft: st === CRITICAL ? `3px solid ${STATUS_UI[2].color}` : st === OFFLINE ? "3px dashed var(--st-offline)" : "3px solid transparent" }}
    >
      <StatusBadge code={st} />
      <span>{d.deviceId}</span>
      <span className="truncate font-sans text-[13px]">{d.type}</span>
      <span className="truncate font-sans text-[13px]">
        F{d.floor} › {d.zone} › {d.rack}
      </span>
      <span className="truncate">{breaching ? sensorAt(w).label : "—"}</span>
      {VALUE_COLS.map((k) => {
        const j = sensorIndex(k);
        const r = store.readingStatus[idx * SENSOR_COUNT + j] ?? 0;
        const color = st === OFFLINE ? undefined : r === CRITICAL ? STATUS_UI[2].color : r === WARNING ? STATUS_UI[1].color : undefined;
        return (
          <span key={`${k}-${version}`} className={`px-1 ${st !== OFFLINE ? "flash" : ""}`} style={{ color, fontWeight: r === CRITICAL ? 700 : 400 }}>
            {st === OFFLINE ? "—" : roundFor(j, store.values[idx * SENSOR_COUNT + j] ?? 0)}
          </span>
        );
      })}
      <span className="text-muted">
        {stale && <span aria-label="stale">⏱ </span>}
        {ago(seen, now)}
      </span>
    </button>
  );
});

export function DeviceTable({ matches, filterKey, selected, onOpen, onClear }: { matches: (idx: number) => boolean; filterKey: string; selected: number | null; onOpen: (idx: number) => void; onClear: () => void }): React.JSX.Element {
  const { store } = useLive();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "severity", dir: -1 });
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null); // device idx, stable across re-sorts
  const scrollRef = useRef<HTMLDivElement>(null);
  const paused = hovered || focused;

  // Live order refreshes every RESORT_MS, never per delta, and pauses while the pointer is
  // over the table so rows do not jump under the cursor.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (!paused) setTick((n) => n + 1);
    }, RESORT_MS);
    return () => clearInterval(t);
  }, [paused]);

  const order = useMemo(() => {
    void tick;
    const ids: number[] = [];
    for (let i = 0; i < store.devices.length; i++) if (matches(i)) ids.push(i);
    ids.sort((a, b) => {
      const x = sortValue(store, a, sort.key);
      const y = sortValue(store, b, sort.key);
      return x === y ? a - b : (x > y ? 1 : -1) * sort.dir;
    });
    return ids;
    // filterKey stands in for `matches`, which is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, store.devices, tick, sort, filterKey]);

  const virtual = useVirtualizer({ count: order.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });
  const cursorPos = cursor === null ? -1 : order.indexOf(cursor);

  // Keyboard: arrows / Page / Home / End move the highlighted row, Enter opens it.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!order.length) return;
    const page = Math.max(1, Math.floor(520 / ROW_H) - 1);
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    let next: number | null = null;
    if (e.key in moves) next = Math.min(order.length - 1, Math.max(0, (cursorPos < 0 ? -1 : cursorPos) + (moves[e.key] ?? 0)));
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = order.length - 1;
    else if (e.key === "Enter" && cursor !== null) {
      e.preventDefault();
      onOpen(cursor);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setCursor(order[next] ?? null);
    virtual.scrollToIndex(next, { align: "auto" });
  };

  return (
    <section aria-label="Devices" className="panel flex min-h-0 flex-col" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="ptitle">Devices</h2>
        <span className="num text-xs text-muted">
          {paused && <span className="mr-2 border border-warning/50 px-1.5 text-warning">⏸ live order paused</span>}
          <span className="mr-2 hidden lg:inline">↑↓ move · Enter open ·</span>
          {order.length.toLocaleString("en-US")} of {store.devices.length.toLocaleString("en-US")} · virtualized
        </span>
      </div>
      <div role="row" className={`${GRID} border-b border-border bg-surface py-2 text-[11px] tracking-[.1em] text-muted uppercase`}>
        {COLS.map((c) =>
          c.key ? (
            <button key={c.label} type="button" className={`text-left uppercase hover:text-text ${sort.key === c.key ? "text-accent" : ""}`} onClick={() => setSort((s) => ({ key: c.key!, dir: s.key === c.key ? (-s.dir as 1 | -1) : -1 }))}>
              {c.label}
              {sort.key === c.key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
            </button>
          ) : (
            <span key={c.label}>{c.label}</span>
          ),
        )}
      </div>
      <div
        ref={scrollRef}
        role="grid"
        aria-label="Device list: arrow keys to move, Enter to open"
        aria-rowcount={order.length}
        aria-activedescendant={cursorPos >= 0 && cursor !== null ? `device-row-${cursor}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="relative h-[520px] overflow-y-auto"
      >
        {!store.loaded ? (
          <div className="flex flex-col gap-1 p-2">{Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton h-7" />)}</div>
        ) : order.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted">
            No devices match these filters.{" "}
            <button type="button" onClick={onClear} className="text-accent underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((v) => {
              const idx = order[v.index] ?? 0;
              return (
                <div key={idx} style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${v.start}px)` }}>
                  <Row idx={idx} selected={selected === idx} active={cursor === idx} now={now} onOpen={(i) => { setCursor(i); onOpen(i); }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
