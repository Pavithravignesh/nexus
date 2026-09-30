"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { decodeFleetMeta } from "@/shared/fleet-meta";
import { fleetMetaSchema, latestSchema, summaryResponseSchema } from "@/shared/schemas/api.schema";
import { alertFrameSchema, deltaFrameSchema, helloSchema, summarySchema } from "@/shared/schemas/stream.schema";
import { fetchJson } from "@/lib/api";
import { TelemetryStore, type Topic } from "@/lib/telemetry-store";
import { fetchThresholds } from "@/lib/thresholds-api";
import { setThresholds, thresholdsSchema } from "@/shared/thresholds";

/** The stream counts as quiet after this many missed ticks (tick length comes from the server). */
const QUIET_AFTER_TICKS = 5;
const MAX_BACKOFF_MS = 30_000;

type LiveApi = { store: TelemetryStore; error: string | null; retry: () => void; retryInMs: number | null };
const Ctx = createContext<LiveApi | null>(null);

async function loadSnapshot(store: TelemetryStore): Promise<void> {
  const [meta, latest, sum, thresholds] = await Promise.all([
    fetchJson("/api/fleet", fleetMetaSchema),
    fetchJson("/api/telemetry/latest", latestSchema),
    fetchJson("/api/summary?alerts=300", summaryResponseSchema),
    fetchThresholds(),
  ]);
  setThresholds(thresholds); // before the snapshot, so its reading statuses use the live rules
  store.applySnapshot({ devices: decodeFleetMeta(meta), rows: latest.rows, seq: latest.seq, summary: sum.summary, alerts: sum.alerts });
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, raw: string): T | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    console.warn("dropped malformed stream frame");
    return null;
  }
  return r.data;
}

/**
 * Owns the snapshot load and the single EventSource. Snapshot first, then the stream; after
 * any reconnect the snapshot is reloaded once (not polling) so nothing missed stays wrong.
 */
export function TelemetryProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [store] = useState(() => new TelemetryStore());
  const [error, setError] = useState<string | null>(null);
  const [retryInMs, setRetryInMs] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    let backoff = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let needsReload = false;

    const open = (): void => {
      if (cancelled) return;
      store.setConnection(store.loaded ? "reconnecting" : "connecting");
      const es = new EventSource("/api/stream");
      esRef.current = es;
      es.onopen = () => {
        backoff = 1000;
        setRetryInMs(null);
        if (needsReload) {
          needsReload = false;
          loadSnapshot(store).catch(() => {});
        }
      };
      // Every handler also feeds the live stream metrics (bytes, event id, latency, clients).
      const raw = (e: Event): { data: string; eventId: number } => {
        const m = e as MessageEvent<string>;
        return { data: m.data, eventId: Number(m.lastEventId) || 0 };
      };
      es.addEventListener("hello", (e) => {
        const { data, eventId } = raw(e);
        const h = parse(helloSchema, data);
        store.recordFrame(data.length, { eventId });
        if (h) store.applyHello(h);
      });
      es.addEventListener("summary", (e) => {
        const { data, eventId } = raw(e);
        const s = parse(summarySchema, data);
        if (!s) return;
        store.recordFrame(data.length, { eventId, serverTs: s.ts, clients: s.clients });
        store.applySummary(s);
        store.setConnection("live");
      });
      es.addEventListener("delta", (e) => {
        const { data, eventId } = raw(e);
        store.recordFrame(data.length, { eventId });
        const d = parse(deltaFrameSchema, data);
        if (d) store.applyDelta(d);
      });
      es.addEventListener("alert", (e) => {
        const { data, eventId } = raw(e);
        store.recordFrame(data.length, { eventId });
        const a = parse(alertFrameSchema, data);
        if (a) store.applyAlerts(a);
      });
      es.addEventListener("thresholds", (e) => {
        const { data, eventId } = raw(e);
        store.recordFrame(data.length, { eventId });
        const t = parse(thresholdsSchema, data);
        if (!t) return;
        setThresholds(t);
        store.rederive();
      });
      es.onerror = () => {
        needsReload = true;
        store.setConnection("reconnecting");
        if (es.readyState === EventSource.CLOSED) {
          // The browser gave up; retry ourselves with exponential backoff + jitter.
          const wait = Math.min(backoff, MAX_BACKOFF_MS) * (0.8 + Math.random() * 0.4);
          backoff *= 2;
          setRetryInMs(wait);
          timer = setTimeout(open, wait);
        }
      };
    };

    loadSnapshot(store)
      .then(() => {
        if (!cancelled) {
          setError(null);
          open();
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the fleet");
      });

    const staleCheck = setInterval(() => {
      if (store.connection === "live" && Date.now() - store.lastFrameAt > store.tickMs * QUIET_AFTER_TICKS) store.setConnection("stale");
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(staleCheck);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [store, attempt]);

  const retry = useCallback(() => {
    esRef.current?.close();
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  return <Ctx.Provider value={{ store, error, retry, retryInMs }}>{children}</Ctx.Provider>;
}

export function useLive(): LiveApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive must be used inside <TelemetryProvider>");
  return v;
}

/** Re-render when a topic changes; returns the store for reading. */
export function useTopic(topic: Topic): TelemetryStore {
  const { store } = useLive();
  useSyncExternalStore(
    (cb) => store.subscribe(topic, cb),
    () => store.version(topic),
    () => 0,
  );
  return store;
}

/** Re-render when one device row changes. */
export function useRow(idx: number): TelemetryStore {
  const { store } = useLive();
  useSyncExternalStore(
    (cb) => store.subscribeRow(idx, cb),
    () => store.rowVersion(idx),
    () => 0,
  );
  return store;
}

/** A clock that ticks every second, for "updated Xs ago" labels. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
