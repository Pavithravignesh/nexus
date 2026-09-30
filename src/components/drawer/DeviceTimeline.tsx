"use client";

import { useEffect, useState } from "react";
import { fetchEvents, type EventsPageData } from "@/lib/api";
import { toggleInSet } from "@/lib/list-filters";
import { SEVERITY_CODE, STATUS_UI } from "../status";
import { Chip } from "../ui/ListControls";

const KINDS = ["raised", "cleared", "offline", "online", "acked"] as const;
type Kind = (typeof KINDS)[number];
const KIND_COLOR: Record<Kind, string> = { raised: "var(--st-critical)", cleared: "var(--st-normal)", offline: "var(--st-offline)", online: "var(--accent-2)", acked: "var(--accent)" };
const PAGE = 10;

type Loaded = { items: EventsPageData["items"]; nextCursor: string | null; available: boolean };

/**
 * Persisted events for one device from GET /api/events, newest first. Kind filters and
 * "Load older" page through MongoDB with a keyset cursor (no polling; it refetches when the
 * device changes status, i.e. when a new event was just written).
 */
export function DeviceTimeline({ deviceId, statusKey }: { deviceId: string; statusKey: number }): React.JSX.Element {
  const [kinds, setKinds] = useState<ReadonlySet<Kind>>(new Set(KINDS));
  const [data, setData] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kindParam = [...kinds].join(",");

  useEffect(() => {
    const ac = new AbortController();
    fetchEvents({ deviceId, kind: kindParam, limit: PAGE }, ac.signal)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : "Could not load events");
      });
    return () => ac.abort();
  }, [deviceId, kindParam, statusKey]);

  const loadOlder = (): void => {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    fetchEvents({ deviceId, kind: kindParam, limit: PAGE, cursor: data.nextCursor })
      .then((r) => setData((d) => (d ? { ...r, items: [...d.items, ...r.items] } : r)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load events"))
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="ptitle">Device timeline</h3>
        <span className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <Chip key={k} on={kinds.has(k)} color={KIND_COLOR[k]} onClick={() => setKinds((s) => toggleInSet(s, k))}>
              {k}
            </Chip>
          ))}
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      ) : data === null ? (
        <div className="skeleton h-16" />
      ) : !data.available ? (
        <p className="text-sm text-muted">Event history needs MongoDB, which is not connected right now.</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-muted">No recorded transitions for these kinds yet.</p>
      ) : (
        <>
          <ul className="num flex flex-col gap-1 text-xs">
            {data.items.map((e) => (
              <li key={e.id} className="grid grid-cols-[70px_70px_1fr] gap-2">
                <span className="text-muted">{new Date(e.ts).toLocaleTimeString("en-GB")}</span>
                <span style={{ color: KIND_COLOR[e.kind as Kind] ?? "var(--text)" }}>{e.kind}</span>
                <span>
                  {e.sensor ?? "device"} {e.value ?? ""} <span style={{ color: STATUS_UI[SEVERITY_CODE[e.severity as keyof typeof SEVERITY_CODE] ?? 0].color }}>({e.severity})</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
            <span className="num">{data.items.length} shown</span>
            {data.nextCursor ? (
              <button type="button" onClick={loadOlder} disabled={loadingMore} className="border border-border px-2 py-0.5 hover:text-[var(--text)] disabled:opacity-40">
                {loadingMore ? "Loading…" : "Load older ▾"}
              </button>
            ) : (
              <span>Start of history</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
