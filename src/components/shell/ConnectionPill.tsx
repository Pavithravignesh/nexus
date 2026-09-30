"use client";

import { useEffect, useRef, useState } from "react";
import { useNow, useTopic } from "@/hooks/useTelemetry";
import { ago } from "../status";

const STATE = {
  live: { text: "LIVE", color: "var(--st-normal)" },
  stale: { text: "STALE", color: "var(--st-warning)" },
  connecting: { text: "CONNECTING", color: "var(--accent-2)" },
  reconnecting: { text: "RECONNECTING", color: "var(--st-warning)" },
} as const;

const kb = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`);

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Live, measured SSE status: latency, tick rate, throughput, with a details panel on click. */
export function ConnectionPill(): React.JSX.Element {
  const store = useTopic("stream");
  useTopic("connection");
  const now = useNow();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const st = STATE[store.connection];
  const s = store.stats.snapshot();
  const expectedHz = 1000 / store.tickMs;
  const live = store.connection === "live";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows: [string, string][] = [
    ["Transport", "Server-Sent Events (EventSource)"],
    ["State", `${st.text}${store.connectionSince ? ` for ${duration(now - store.connectionSince)}` : ""}`],
    ["Connected since", s.connectedAt ? new Date(s.connectedAt).toLocaleTimeString("en-GB") : "—"],
    ["Latency", s.latencyMs === null ? "—" : `${Math.round(s.latencyMs)} ms (server stamp → here, clock-corrected)`],
    ["Tick rate", `${s.ticksPerSec.toFixed(2)} Hz (server tick ${store.tickMs} ms = ${expectedHz.toFixed(2)} Hz)`],
    ["Frames", `${s.framesPerSec.toFixed(1)} /s · ${s.totalFrames.toLocaleString("en-US")} total`],
    ["Throughput", `${s.kbPerSec.toFixed(1)} KB/s · ${kb(s.totalBytes)} total`],
    ["Last event id", s.lastEventId ? String(s.lastEventId) : "—"],
    ["Last update", store.lastFrameAt ? `${ago(store.lastFrameAt, now)} ago` : "—"],
    ["Reconnects", String(s.reconnects)],
    ["Viewers on server", s.clients === null ? "—" : String(s.clients)],
    ["Stale / offline after", `${store.staleAfterMs / 1000} s / ${store.offlineAfterMs / 1000} s (from server)`],
  ];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Stream ${st.text}. Show connection details`}
        className="num flex items-center gap-2 border px-3 py-1.5 text-xs"
        style={{ color: st.color, borderColor: `color-mix(in srgb, ${st.color} 45%, transparent)`, background: `color-mix(in srgb, ${st.color} 10%, transparent)` }}
      >
        <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "animate-pulse" : ""}`} style={{ background: st.color }} />
        <span role="status" aria-live="polite">
          {st.text} · SSE
        </span>
        {live && (
          <span className="text-muted">
            · {s.latencyMs === null ? "—" : `${Math.round(s.latencyMs)} ms`} · {s.ticksPerSec.toFixed(1)} Hz · {s.kbPerSec.toFixed(0)} KB/s
          </span>
        )}
        {!live && store.lastFrameAt > 0 && <span className="text-muted">· updated {ago(store.lastFrameAt, now)} ago</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Stream details" className="panel num absolute top-full right-0 z-[70] mt-2 w-[380px] text-xs shadow-2xl" style={{ background: "var(--surface)" }}>
          <h2 className="ptitle mb-2">Live stream</h2>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
