"use client";

import { useEffect, useRef, useState } from "react";
import { useLive, useTopic } from "@/hooks/useTelemetry";
import { SENSOR_COUNT, roundFor, sensorAt } from "@/shared/sensors";
import { OFFLINE, worstSensor, zoneStatus, type StatusCode } from "@/shared/status";
import { zoneKey, type Floor, type Zone } from "@/shared/fleet";
import { STATUS_UI, fmt } from "../status";
import type { ControlRoomScene } from "./ControlRoomScene";

type Props = {
  matches: (i: number) => boolean;
  filterKey: string;
  filtered: boolean;
  zone: Zone | null;
  floor: Floor | null;
  selected: number | null;
  onOpen: (idx: number) => void;
  onZone: (zone: Zone | null, floor: Floor | null) => void;
};

type Tip = { x: number; y: number; html: React.ReactNode } | null;

/** The 3D Industrial Control Room hero. Loads three.js lazily and falls back if WebGL is unavailable. */
export function ControlRoom3D({ matches, filterKey, filtered, zone, floor, selected, onOpen, onZone }: Props): React.JSX.Element {
  const { store } = useLive();
  useTopic("summary");
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ControlRoomScene | null>(null);
  const matchRef = useRef<Props["matches"] | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<Tip>(null);
  const [rotating, setRotating] = useState(true);

  // Build the scene once the fleet is loaded.
  useEffect(() => {
    if (!store.loaded || !host.current) return;
    let scene: ControlRoomScene | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let unsubscribe: (() => void) | null = null;
    let themeObserver: MutationObserver | null = null;
    import("./ControlRoomScene")
      .then(({ ControlRoomScene }) => {
        if (cancelled || !host.current) return;
        scene = new ControlRoomScene(host.current, store);
        sceneRef.current = scene;
        const el = host.current;
        scene.resize(el.clientWidth, el.clientHeight);
        ro = new ResizeObserver(([e]) => e && scene?.resize(Math.floor(e.contentRect.width), Math.floor(e.contentRect.height)));
        ro.observe(el);
        scene.update(matchRef.current);
        unsubscribe = store.subscribe("fleet", () => scene?.update(matchRef.current));
        themeObserver = new MutationObserver(() => {
          scene?.applyTheme();
          scene?.update(matchRef.current);
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      ro?.disconnect();
      unsubscribe?.();
      themeObserver?.disconnect();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [store, store.loaded]);

  // Filters: dim LEDs outside the current filter.
  useEffect(() => {
    matchRef.current = filtered ? matches : null;
    sceneRef.current?.update(matchRef.current);
    sceneRef.current?.setSelectedZone(zone, floor);
    // filterKey stands in for `matches`, which is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, filtered, zone, floor, ready]);

  // Fly the camera to the open device.
  useEffect(() => {
    sceneRef.current?.focus(selected);
  }, [selected, ready]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const scene = sceneRef.current;
    if (!scene || e.buttons) return;
    const p = scene.pick(e.clientX, e.clientY);
    const r = e.currentTarget.getBoundingClientRect();
    const at = { x: e.clientX - r.left + 14, y: e.clientY - r.top + 14 };
    e.currentTarget.style.cursor = p ? "pointer" : "grab";
    if (!p) {
      scene.setHoverZone(null);
      setTip(null);
      return;
    }
    if (p.kind === "zone") {
      const zk = zoneKey(p.zone, p.floor);
      scene.setHoverZone(zk);
      const c = store.summary?.byZone[zk] ?? [0, 0, 0, 0];
      const st = zoneStatus(c);
      setTip({
        ...at,
        html: (
          <>
            <b style={{ color: STATUS_UI[st].color }}>
              Zone {p.zone} · Hall {p.floor}
            </b>
            {([2, 1, 3, 0] as StatusCode[]).map((s) => (
              <div key={s} className="flex justify-between gap-4">
                <span style={{ color: STATUS_UI[s].color }}>
                  {STATUS_UI[s].icon} {STATUS_UI[s].label}
                </span>
                <span>{fmt(c[s])}</span>
              </div>
            ))}
            <div className="text-muted">click to filter</div>
          </>
        ),
      });
      return;
    }
    scene.setHoverZone(null);
    const i = p.idx;
    const d = store.devices[i];
    const st = (store.status[i] ?? 0) as StatusCode;
    const w = worstSensor(store.readingStatus, i);
    setTip({
      ...at,
      html: (
        <>
          <b style={{ color: STATUS_UI[st].color }}>
            {STATUS_UI[st].icon} {d?.deviceId}
          </b>{" "}
          <span className="text-muted">{d?.type}</span>
          <div className="text-muted">
            F{d?.floor} › Zone {d?.zone} › {d?.rack}
          </div>
          {st !== OFFLINE && (
            <div>
              {sensorAt(w).label} {roundFor(w, store.values[i * SENSOR_COUNT + w] ?? 0)} {sensorAt(w).unit}
            </div>
          )}
          <div className="text-muted">click to open</div>
        </>
      ),
    });
  };

  const down = useRef<[number, number] | null>(null);
  const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const start = down.current;
    down.current = null;
    if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
    const p = sceneRef.current?.pick(e.clientX, e.clientY);
    if (!p) return;
    setTip(null);
    if (p.kind === "device") onOpen(p.idx);
    else onZone(zone === p.zone && floor === p.floor ? null : p.zone, zone === p.zone && floor === p.floor ? null : p.floor);
  };

  const b = store.summary?.byStatus;
  return (
    <section aria-label="3D control room" className="panel relative overflow-hidden p-0" style={{ padding: 0 }}>
      <div ref={host} className="relative h-[500px] w-full" onPointerMove={onMove} onPointerLeave={() => { setTip(null); sceneRef.current?.setHoverZone(null); }} onPointerDown={(e) => (down.current = [e.clientX, e.clientY])} onPointerUp={onUp}>
        {!ready && !failed && <div className="skeleton absolute inset-0" />}
        {failed && <div className="absolute inset-0 grid place-items-center text-sm text-muted">3D view unavailable in this browser (WebGL). The rest of the dashboard is unaffected.</div>}
        <div className="pointer-events-none absolute top-3 left-4 z-10">
          <h2 className="ptitle">Industrial 3D Control Room</h2>
          <p className="text-xs text-muted">4 halls × 6 zones × 3 racks · one LED per device</p>
          <div className="mt-1 flex gap-3 text-[11px] text-muted">
            {([0, 1, 2, 3] as StatusCode[]).map((s) => (
              <span key={s} style={{ color: STATUS_UI[s].color }}>
                {STATUS_UI[s].icon} {STATUS_UI[s].label}
              </span>
            ))}
          </div>
        </div>
        <div className="absolute top-3 right-3 z-10 flex gap-2">
          <button type="button" onClick={() => { const s = sceneRef.current; if (!s) return; s.setAutoRotate(!s.autoRotate); setRotating(s.autoRotate); }} className={`border px-2.5 py-1 text-[11px] ${rotating ? "border-accent text-accent" : "border-border text-muted"}`} style={{ background: "var(--panel)" }}>
            ⟳ Auto-orbit
          </button>
          <button type="button" onClick={() => { sceneRef.current?.resetView(); setRotating(true); }} className="border border-border px-2.5 py-1 text-[11px] text-muted hover:text-text" style={{ background: "var(--panel)" }}>
            ⌂ Reset view
          </button>
        </div>
        <p className="pointer-events-none absolute bottom-2 left-4 z-10 text-[11px] text-muted">drag = orbit · ctrl + scroll = zoom · hover = inspect · click zone = filter · click LED = open device</p>
        {b && (
          <p className="num pointer-events-none absolute right-4 bottom-2 z-10 text-right text-[11px]">
            <span style={{ color: STATUS_UI[2].color }}>⬣ {fmt(b.CRITICAL)}</span> · <span style={{ color: STATUS_UI[1].color }}>▲ {fmt(b.WARNING)}</span> · <span style={{ color: STATUS_UI[3].color }}>⦸ {fmt(b.OFFLINE)}</span>
            {filtered && <span className="block text-muted">filtered · others dimmed</span>}
          </p>
        )}
        {tip && (
          <div className="num pointer-events-none absolute z-20 min-w-40 border border-border px-2.5 py-2 text-xs shadow-xl" style={{ left: tip.x, top: tip.y, background: "var(--surface)" }}>
            {tip.html}
          </div>
        )}
      </div>
    </section>
  );
}
