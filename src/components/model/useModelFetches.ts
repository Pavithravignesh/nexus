"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { fetchJson } from "@/lib/api";
import type { TelemetryStore } from "@/lib/telemetry-store";
import { SENSOR_COUNT, SENSOR_KEYS, roundFor, sensorIndex, type SensorKey } from "@/shared/sensors";
import { historySchema } from "@/shared/schemas/api.schema";
import { STATUS_NAMES } from "@/shared/status";
import type { TelemetryEvent } from "@/shared/types";
import { appendSample, type SamplePoint } from "./model-data";

// One-off fetches for the model page (on device/sensor change or an explicit reload; never polled).
// History stays live afterwards by appending the store's value each time the fleet ticks.

const HISTORY_KEEP = 6;

const eventSchema = z.object({
  id: z.string(),
  deviceIdx: z.number().int(),
  deviceId: z.string(),
  kind: z.enum(["raised", "cleared", "offline", "online"]),
  severity: z.enum(STATUS_NAMES),
  sensor: z.enum(SENSOR_KEYS).nullable(),
  value: z.number().nullable(),
  ts: z.string(),
}) satisfies z.ZodType<TelemetryEvent>;
const deviceEventsSchema = z.object({ events: z.array(eventSchema) });

export type Fetched<T> = { data: T | null; error: string | null; reload: () => void };

const message = (err: unknown): string => (err instanceof Error ? err.message : "Request failed");

export function useSampleHistory(store: TelemetryStore, idx: number | null, sensor: SensorKey): Fetched<SamplePoint[]> {
  const deviceId = idx === null ? null : (store.devices[idx]?.deviceId ?? null);
  const [state, setState] = useState<{ key: string; data: SamplePoint[] | null; error: string | null }>({ key: "", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${deviceId}|${sensor}|${attempt}`;

  useEffect(() => {
    if (!deviceId) return;
    const ctl = new AbortController();
    fetchJson(`/api/devices/${deviceId}/history?sensor=${sensor}&window=30`, historySchema, { signal: ctl.signal })
      .then((r) => setState({ key, data: (r.series[sensor] ?? []).slice(-HISTORY_KEEP), error: null }))
      .catch((err: unknown) => {
        if (!ctl.signal.aborted) setState({ key, data: null, error: message(err) });
      });
    return () => ctl.abort();
  }, [deviceId, sensor, key]);

  // Live tail: every fleet tick, append this device's current value if it reported.
  useEffect(() => {
    if (idx === null) return;
    const j = sensorIndex(sensor);
    return store.subscribe("fleet", () => {
      const seen = store.lastSeen[idx] ?? 0;
      if (!seen) return;
      const point = { ts: new Date(seen).toISOString(), value: roundFor(j, store.values[idx * SENSOR_COUNT + j] ?? 0) };
      setState((s) => (s.data && s.key === key ? { ...s, data: appendSample(s.data, point, HISTORY_KEEP) } : s));
    });
  }, [store, idx, sensor, key]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null, reload };
}

export function useDeviceEvents(store: TelemetryStore, idx: number | null): Fetched<TelemetryEvent[]> {
  const deviceId = idx === null ? null : (store.devices[idx]?.deviceId ?? null);
  const [state, setState] = useState<{ key: string; data: TelemetryEvent[] | null; error: string | null }>({ key: "", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${deviceId}|${attempt}`;

  useEffect(() => {
    if (!deviceId) return;
    const ctl = new AbortController();
    fetchJson(`/api/devices/${deviceId}`, deviceEventsSchema, { signal: ctl.signal })
      .then((r) => setState({ key, data: r.events, error: null }))
      .catch((err: unknown) => {
        if (!ctl.signal.aborted) setState({ key, data: null, error: message(err) });
      });
    return () => ctl.abort();
  }, [deviceId, key]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null, reload };
}
