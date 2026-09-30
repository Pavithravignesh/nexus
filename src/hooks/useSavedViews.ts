"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import { DEVICE_TYPES, FLOORS, ZONES } from "@/shared/fleet";

// Saved filter views: a per-operator convenience, so they live in this browser's
// localStorage (not the database). Every read tolerates missing, blocked or corrupt storage.

const KEY = "nexus-saved-views";
const EVENT = "nexus-saved-views-change";
const MAX_VIEWS = 8;

export const viewFiltersSchema = z.object({
  q: z.string().max(64),
  status: z.literal([0, 1, 2, 3]).nullable(),
  zone: z.enum(ZONES).nullable(),
  floor: z.literal(FLOORS).nullable(),
  sensor: z.number().int().min(0).max(9).nullable(),
  // Added later: defaults keep views saved before these filters existed loadable.
  type: z.enum(DEVICE_TYPES).nullable().default(null),
  stale: z.boolean().default(false),
});
export type ViewFilters = z.infer<typeof viewFiltersSchema>;

const savedViewsSchema = z.array(z.object({ name: z.string().min(1).max(32), filters: viewFiltersSchema })).max(MAX_VIEWS);
export type SavedView = z.infer<typeof savedViewsSchema>[number];

const EMPTY: SavedView[] = [];
let cacheRaw: string | null = null;
let cacheParsed: SavedView[] = EMPTY;

function read(): SavedView[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cacheRaw) return cacheParsed; // stable identity for useSyncExternalStore
  cacheRaw = raw;
  let json: unknown = [];
  try {
    json = raw ? JSON.parse(raw) : [];
  } catch {
    json = [];
  }
  const parsed = savedViewsSchema.safeParse(json);
  cacheParsed = parsed.success ? parsed.data : EMPTY;
  return cacheParsed;
}

function write(views: SavedView[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(views));
  } catch {
    // storage blocked: views last for this page only via the cache
    cacheRaw = null;
    cacheParsed = views;
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSavedViews(): { views: SavedView[]; save: (name: string, filters: ViewFilters) => void; remove: (name: string) => void } {
  const views = useSyncExternalStore(subscribe, read, () => EMPTY);
  const save = useCallback((name: string, filters: ViewFilters) => {
    const clean = name.trim().slice(0, 32);
    if (!clean) return;
    const rest = read().filter((v) => v.name !== clean);
    write([{ name: clean, filters }, ...rest].slice(0, MAX_VIEWS));
  }, []);
  const remove = useCallback((name: string) => write(read().filter((v) => v.name !== name)), []);
  return { views, save, remove };
}

/** Short human label for a filter set, e.g. "CRITICAL · C2 · CO2". */
export function describeFilters(f: ViewFilters, sensorLabels: readonly string[], statusLabels: readonly string[]): string {
  const parts = [
    f.status !== null ? statusLabels[f.status] : null,
    f.zone || f.floor ? `${f.zone ?? "*"}${f.floor ?? "*"}` : null,
    f.sensor !== null ? sensorLabels[f.sensor] : null,
    f.type,
    f.stale ? "stale" : null,
    f.q ? `"${f.q}"` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "all devices";
}
