"use client";

import { useCallback, useState } from "react";
import { TelemetryProvider, useLive } from "@/hooks/useTelemetry";
import { EMPTY_FILTERS, FILTER_OPTIONS, filtersKey, isFiltered, matchesDevice, type DeviceFilters } from "@/lib/device-filters";
import type { DeviceType, Floor, Zone } from "@/shared/fleet";
import { SENSORS } from "@/shared/sensors";
import type { StatusCode } from "@/shared/status";
import { AlertsPanel } from "./alerts/AlertsPanel";
import { FleetHealthChart, StatusDonut } from "./charts/FleetCharts";
import { BreachRadar, FleetGauges, ZoneHeatmap } from "./charts/LocationCharts";
import { DeviceTable } from "./devices/DeviceTable";
import { DeviceDrawer } from "./drawer/DeviceDrawer";
import { SavedViews } from "./filters/SavedViews";
import { KpiStrip } from "./kpi/KpiStrip";
import { STATUS_UI } from "./status";
import { ControlRoom3D } from "./three/ControlRoom3D";
import { DisconnectedBanner, TopBar } from "./shell/TopBar";

const EMPTY = EMPTY_FILTERS;

function Board(): React.JSX.Element {
  const { store, error, retry } = useLive();
  const [f, setF] = useState<DeviceFilters>(EMPTY);
  const [selected, setSelected] = useState<number | null>(null);
  const matches = useCallback((i: number): boolean => matchesDevice(store, f, i, Date.now(), store.staleAfterMs), [store, f]);
  const filterKey = filtersKey(f);
  const close = useCallback(() => setSelected(null), []);
  const active = isFiltered(f);

  return (
    <div className="min-h-screen">
      <TopBar query={f.q} onQuery={(v) => setF((x) => ({ ...x, q: v }))} />
      <DisconnectedBanner />
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="tracking-[.12em] uppercase">Filters</span>
              <select aria-label="Status" value={f.status ?? ""} onChange={(e) => setF((x) => ({ ...x, status: e.target.value === "" ? null : (Number(e.target.value) as StatusCode) }))} className="border border-border bg-surface px-2 py-1 text-text">
                <option value="">All statuses</option>
                {([2, 1, 3, 0] as StatusCode[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_UI[s].icon} {STATUS_UI[s].label}
                  </option>
                ))}
              </select>
              <select aria-label="Floor" value={f.floor ?? ""} onChange={(e) => setF((x) => ({ ...x, floor: e.target.value ? (Number(e.target.value) as Floor) : null }))} className="border border-border bg-surface px-2 py-1 text-text">
                <option value="">All floors</option>
                {FILTER_OPTIONS.floors.map((fl) => (
                  <option key={fl} value={fl}>
                    Floor {fl}
                  </option>
                ))}
              </select>
              <select aria-label="Zone" value={f.zone ?? ""} onChange={(e) => setF((x) => ({ ...x, zone: (e.target.value || null) as Zone | null }))} className="border border-border bg-surface px-2 py-1 text-text">
                <option value="">All zones</option>
                {FILTER_OPTIONS.zones.map((z) => (
                  <option key={z} value={z}>
                    Zone {z}
                  </option>
                ))}
              </select>
              <select aria-label="Breaching sensor" value={f.sensor ?? ""} onChange={(e) => setF((x) => ({ ...x, sensor: e.target.value === "" ? null : Number(e.target.value) }))} className="border border-border bg-surface px-2 py-1 text-text">
                <option value="">Any sensor</option>
                {SENSORS.map((s, j) => (
                  <option key={s.key} value={j}>
                    Breaching {s.label}
                  </option>
                ))}
              </select>
              <select aria-label="Device type" value={f.type ?? ""} onChange={(e) => setF((x) => ({ ...x, type: (e.target.value || null) as DeviceType | null }))} className="border border-border bg-surface px-2 py-1 text-text">
                <option value="">All device types</option>
                {FILTER_OPTIONS.types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 border border-border bg-surface px-2 py-1 text-text">
                <input type="checkbox" checked={f.stale} onChange={(e) => setF((x) => ({ ...x, stale: e.target.checked }))} className="accent-[var(--accent)]" />
                Stale only
              </label>
              {active && (
                <button type="button" onClick={() => setF(EMPTY)} className="border border-accent/60 px-2 py-1 text-accent hover:bg-accent/15">
                  Clear all ✕
                </button>
              )}
              <SavedViews current={f} canSave={Boolean(active)} onApply={setF} />
              <span className="ml-auto hidden md:inline">
                click any chart, KPI or alert to drill in · <kbd className="num">/</kbd> search · <kbd className="num">Esc</kbd> close
              </span>
            </div>

            <KpiStrip status={f.status} onStatus={(s) => setF((x) => ({ ...x, status: s }))} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-8">
                <ControlRoom3D matches={matches} filterKey={filterKey} filtered={Boolean(active)} zone={f.zone} floor={f.floor} selected={selected} onOpen={setSelected} onZone={(z, fl) => setF((x) => ({ ...x, zone: z, floor: fl }))} />
              </div>
              <div className="min-w-0 xl:col-span-4">
                <AlertsPanel onOpen={setSelected} matches={matches} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-5">
                <FleetHealthChart />
              </div>
              <div className="min-w-0 lg:col-span-3">
                <StatusDonut status={f.status} onStatus={(st) => setF((x) => ({ ...x, status: st }))} />
              </div>
              <div className="min-w-0 lg:col-span-4">
                <BreachRadar sensor={f.sensor} onSensor={(sn) => setF((x) => ({ ...x, sensor: sn }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-6">
                <ZoneHeatmap zone={f.zone} floor={f.floor} onZone={(z, fl) => setF((x) => ({ ...x, zone: z, floor: fl }))} />
              </div>
              <div className="min-w-0 lg:col-span-6">
                <FleetGauges />
              </div>
            </div>

            <DeviceTable matches={matches} filterKey={filterKey} selected={selected} onOpen={setSelected} onClear={() => setF(EMPTY)} />
          </>
        )}
      </main>
      {selected !== null && <DeviceDrawer idx={selected} onClose={close} />}
    </div>
  );
}

export function Dashboard(): React.JSX.Element {
  return (
    <TelemetryProvider>
      <Board />
    </TelemetryProvider>
  );
}
