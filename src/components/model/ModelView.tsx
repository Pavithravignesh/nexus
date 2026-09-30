"use client";

import Link from "next/link";
import { useState } from "react";
import { TelemetryProvider, useLive, useTopic } from "@/hooks/useTelemetry";
import { deviceIdxFor } from "@/shared/fleet";
import { SENSORS, type SensorKey } from "@/shared/sensors";
import type { StatusCode } from "@/shared/status";
import { STATUS_UI, StatusBadge } from "../status";
import { ThemeToggle } from "../shell/ThemeToggle";
import { EntityPanel } from "./EntityPanel";
import { ErdDiagram } from "./ErdDiagram";
import { DEFAULT_SENSOR, defaultDevice, packedRow, sseFrame, type EntityName } from "./model-data";

const PILL = {
  live: { text: "LIVE · SSE", color: "var(--st-normal)" },
  stale: { text: "STALE", color: "var(--st-warning)" },
  connecting: { text: "CONNECTING", color: "var(--accent-2)" },
  reconnecting: { text: "RECONNECTING", color: "var(--st-warning)" },
} as const;

function Header(): React.JSX.Element {
  const store = useTopic("connection");
  const pill = PILL[store.connection];
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-3">
      <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-[.12em]">
        <span aria-hidden className="inline-block h-6 w-6 rotate-45 border-2 border-accent bg-accent/20" />
        NEXUS <span className="font-medium text-muted">OPS</span>
      </Link>
      <span className="ptitle text-muted">/ Data model</span>
      <div className="flex-1" />
      <div role="status" aria-live="polite" className="num flex items-center gap-2 border px-3 py-1.5 text-xs" style={{ color: pill.color, borderColor: `color-mix(in srgb, ${pill.color} 45%, transparent)`, background: `color-mix(in srgb, ${pill.color} 10%, transparent)` }}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${store.connection === "live" ? "animate-pulse" : ""}`} style={{ background: pill.color }} />
        {pill.text}
      </div>
      <ThemeToggle />
      <Link href="/" className="border border-accent/60 px-3 py-1 text-sm text-accent hover:bg-accent/15">
        ← Overview
      </Link>
    </header>
  );
}

function DevicePicker({ idx, onPick, sensor, onSensor }: { idx: number | null; onPick: (i: number) => void; sensor: SensorKey; onSensor: (s: SensorKey) => void }): React.JSX.Element {
  const store = useTopic("fleet");
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);
  const d = idx === null ? undefined : store.devices[idx];
  const n = store.devices.length;

  const submit = (ev: React.FormEvent): void => {
    ev.preventDefault();
    const raw = draft.trim().toUpperCase();
    const asNum = /^\d+$/.test(raw) ? Number(raw) - 1 : null;
    const i = asNum ?? deviceIdxFor(raw);
    if (i === null || i < 0 || i >= n) {
      setBad(true);
      return;
    }
    setBad(false);
    setDraft("");
    onPick(i);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="tracking-[.12em] uppercase">Sample device</span>
      {d && idx !== null ? (
        <span className="num flex items-center gap-2 text-text">
          {d.deviceId} <StatusBadge code={(store.status[idx] ?? 0) as StatusCode} />
        </span>
      ) : (
        <span className="skeleton inline-block h-5 w-40" />
      )}
      <form onSubmit={submit} className="flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setBad(false);
          }}
          placeholder="DEV-00042"
          aria-label="Device id"
          aria-invalid={bad}
          className="num w-28 border bg-surface px-2 py-1 text-text outline-none placeholder:text-muted"
          style={{ borderColor: bad ? "var(--st-critical)" : "var(--border)" }}
        />
        <button type="submit" disabled={!n} className="border border-border px-2 py-1 text-text hover:bg-[var(--wash-strong)] disabled:opacity-50">
          Go
        </button>
      </form>
      <button type="button" disabled={!n} onClick={() => onPick(Math.floor(Math.random() * n))} className="border border-border px-2 py-1 text-text hover:bg-[var(--wash-strong)] disabled:opacity-50">
        ⤨ Random device
      </button>
      <button type="button" disabled={!store.alerts.length} onClick={() => onPick(defaultDevice(store))} className="border px-2 py-1 hover:bg-[var(--wash-strong)] disabled:opacity-50" style={{ color: STATUS_UI[2].color, borderColor: `color-mix(in srgb, ${STATUS_UI[2].color} 45%, transparent)` }}>
        {STATUS_UI[2].icon} Top alert
      </button>
      <label className="ml-2 flex items-center gap-1.5">
        <span className="tracking-[.12em] uppercase">Sensor</span>
        <select value={sensor} onChange={(e) => onSensor(e.target.value as SensorKey)} className="border border-border bg-surface px-2 py-1 text-text">
          {SENSORS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label} ({s.unit})
            </option>
          ))}
        </select>
      </label>
      {bad && <span className="text-critical">Unknown device. Use DEV-00001 … DEV-{String(n).padStart(5, "0")}.</span>}
    </div>
  );
}

function WireFormat({ idx }: { idx: number | null }): React.JSX.Element {
  const store = useTopic("fleet");
  useTopic("summary");
  const frame = idx === null || !store.loaded ? null : sseFrame("delta", store.seq, { seq: store.seq, ts: store.summary?.ts ?? "", rows: [packedRow(store, idx)] });
  return (
    <section aria-label="Wire format" className="panel">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="ptitle">Wire format</h2>
        <span className="hint">GET /api/stream · text/event-stream · one frame per event per tick</span>
      </div>
      {frame ? <pre className="num overflow-x-auto border border-border bg-[var(--wash)] p-3 text-[11.5px] leading-relaxed whitespace-pre">{frame}</pre> : <div className="skeleton h-20" />}
      <p className="hint mt-2">
        Every frame carries <span className="num">id: &lt;seq&gt;</span>. Events: <span className="num">hello</span> on connect, <span className="num">summary</span> and <span className="num">delta</span> every tick, <span className="num">alert</span> on transitions, and a <span className="num">: hb</span> comment heartbeat. The browser validates each frame with the shared zod schemas and drops bad ones.
      </p>
    </section>
  );
}

function ModelBoard(): React.JSX.Element {
  const { error, retry } = useLive();
  const store = useTopic("alerts");
  const [entity, setEntity] = useState<EntityName>("Device");
  const [picked, setPicked] = useState<number | null>(null);
  const [sensor, setSensor] = useState<SensorKey>(DEFAULT_SENSOR);
  // Freeze the default (first device with an open alert) once the snapshot is in, so the sample does not jump every tick.
  if (picked === null && store.loaded && store.devices.length) setPicked(defaultDevice(store));

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-[1600px] flex-col gap-4 p-5">
        {error ? (
          <div role="alert" className="panel py-16 text-center">
            <p className="ptitle text-critical">Could not load the fleet</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button type="button" onClick={retry} className="mt-4 border border-accent px-4 py-1 text-sm text-accent hover:bg-accent/15">
              Retry
            </button>
          </div>
        ) : (
          <>
            <DevicePicker idx={picked} onPick={setPicked} sensor={sensor} onSensor={setSensor} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
                <section aria-label="Entity-relationship diagram" className="panel">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="ptitle">Entities &amp; storage</h2>
                    <span className="hint">hover to trace relations · click (or Enter) to inspect · samples update every tick</span>
                  </div>
                  <ErdDiagram selected={entity} onSelect={setEntity} />
                </section>
                <WireFormat idx={picked} />
              </div>
              <div className="min-w-0 xl:col-span-4">
                <EntityPanel entity={entity} onSelect={setEntity} idx={picked} sensor={sensor} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export function ModelView(): React.JSX.Element {
  return (
    <TelemetryProvider>
      <ModelBoard />
    </TelemetryProvider>
  );
}
