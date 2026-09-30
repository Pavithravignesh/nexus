"use client";

import { useTopic } from "@/hooks/useTelemetry";
import type { TelemetryStore } from "@/lib/telemetry-store";
import { SENSORS, sensorIndex, type SensorKey } from "@/shared/sensors";
import {
  ENTITIES,
  STORAGE_UI,
  alertSample,
  deltaDevices,
  deltaSample,
  deviceSample,
  eventSample,
  readingSample,
  related,
  sensorTypeSample,
  summarySample,
  type EntityName,
} from "./model-data";
import { useDeviceEvents, useSampleHistory } from "./useModelFetches";

type Props = {
  entity: EntityName;
  onSelect: (e: EntityName) => void;
  idx: number | null;
  sensor: SensorKey;
};

type Live = { json: unknown; note?: string; error?: string; reload?: () => void };

function useLiveSample(store: TelemetryStore, entity: EntityName, idx: number | null, sensor: SensorKey): Live | null {
  const history = useSampleHistory(store, entity === "Sample" ? idx : null, sensor);
  const events = useDeviceEvents(store, entity === "Event" ? idx : null);
  if (!store.loaded) return null;
  const j = sensorIndex(sensor);
  const deviceId = idx === null ? null : store.devices[idx]?.deviceId;
  switch (entity) {
    case "SensorType":
      return { json: sensorTypeSample(j), note: `SENSORS[${j}] · static, same object on server and browser` };
    case "Device":
      return idx === null ? null : { json: deviceSample(store, idx), note: "devices document · status and lastSeen are derived live from the in-memory state" };
    case "Reading":
      return idx === null ? null : { json: readingSample(store, idx, j), note: "latest_readings document, rebuilt from the store's typed arrays every tick" };
    case "Sample":
      if (history.error) return { json: null, error: history.error, reload: history.reload };
      if (!history.data) return null;
      return {
        json: { deviceId, sensor, samples: history.data },
        note: `GET /api/devices/${deviceId}/history?sensor=${sensor}&window=30 once, then the live value is appended each tick`,
        reload: history.reload,
      };
    case "Alert":
      return { json: alertSample(store.alerts), note: "store.alerts[0] · open alerts, critical first then newest" };
    case "Event":
      if (events.error) return { json: null, error: events.error, reload: events.reload };
      if (!events.data) return null;
      return {
        json: events.data.length ? eventSample(events.data) : [],
        note: events.data.length ? `GET /api/devices/${deviceId} · first 3 of ${events.data.length} events` : `No persisted events for ${deviceId} yet (events flush to MongoDB in batches; empty when MongoDB is unavailable)`,
        reload: events.reload,
      };
    case "Summary":
      return { json: summarySample(store.summary), note: "store.summary · byZone trimmed to 3 of 24 zones" };
    case "Delta": {
      const s = store.summary;
      return idx === null
        ? null
        : { json: deltaSample(store, deltaDevices(idx, store.devices.length), store.seq, s?.ts ?? new Date().toISOString(), s?.reporting ?? null), note: "3 rows packed from the store's typed arrays: [idx, status, lastSeen, v0..v9]" };
    }
  }
}

/** Side panel for the selected entity: description, fields, relations and a live JSON sample. */
export function EntityPanel({ entity, onSelect, idx, sensor }: Props): React.JSX.Element {
  const store = useTopic("fleet");
  useTopic("summary");
  useTopic("alerts");
  const e = ENTITIES[entity];
  const ui = STORAGE_UI[e.storage];
  const { rels } = related(entity);
  const live = useLiveSample(store, entity, idx, sensor);
  const sensorLabel = SENSORS[sensorIndex(sensor)]?.label ?? sensor;

  return (
    <section aria-label={`${entity} entity`} className="panel flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="ptitle text-base">{entity}</h2>
        <span className="num border px-2 py-0.5 text-[10px] uppercase" style={{ color: ui.color, borderColor: `color-mix(in srgb, ${ui.color} 45%, transparent)`, background: `color-mix(in srgb, ${ui.color} 10%, transparent)` }}>
          {ui.label}
        </span>
      </div>
      <p className="num text-xs text-muted">{e.where}</p>
      <p className="text-sm leading-snug">{e.desc}</p>

      <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="hint uppercase">Fields</dt>
        <dd className="num text-xs leading-relaxed">
          {e.fields.map((f) => (
            <span key={f} className="mr-1 mb-1 inline-block border border-border px-1.5" style={/PK|FK/.test(f) ? { color: ui.color } : undefined}>
              {f}
            </span>
          ))}
        </dd>
        <dt className="hint uppercase">Related</dt>
        <dd className="flex flex-col gap-1">
          {rels.map((r) => {
            const other = r.from === entity ? r.to : r.from;
            return (
              <button key={`${r.from}-${r.to}`} type="button" onClick={() => onSelect(other)} className="text-left text-sm hover:text-accent">
                {r.from} → {r.to} <span className="hint">({r.label})</span>
              </button>
            );
          })}
        </dd>
      </dl>

      <div className="border-t border-border pt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="hint flex items-center gap-1.5 uppercase">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-normal" /> Live sample
            {(entity === "Reading" || entity === "Sample" || entity === "SensorType") && <span className="normal-case">· {sensorLabel}</span>}
          </h3>
          {live?.reload && (
            <button type="button" onClick={live.reload} className="border border-border px-2 py-0.5 text-[11px] text-muted hover:text-text">
              Refetch
            </button>
          )}
        </div>
        {live?.error ? (
          <div role="alert" className="border border-critical/50 bg-critical/10 p-3 text-sm text-critical">
            Could not load the sample: {live.error}
          </div>
        ) : live ? (
          <>
            <pre className="num max-h-[420px] overflow-auto border border-border bg-[var(--wash)] p-3 text-[11.5px] leading-relaxed">{JSON.stringify(live.json, null, 2)}</pre>
            {live.note && <p className="hint mt-1.5">{live.note}</p>}
          </>
        ) : (
          <div className="flex flex-col gap-1.5" aria-label="Loading sample">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="skeleton h-3.5" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
