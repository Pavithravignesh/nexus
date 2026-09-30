"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLive } from "@/hooks/useTelemetry";
import { resetThresholds, saveThresholds } from "@/lib/thresholds-api";
import { SENSORS, type SensorKey } from "@/shared/sensors";
import { getThresholds, setThresholds, sidesOf, type BoundSide, type Thresholds } from "@/shared/thresholds";
import { checkDraft, toDraft, type Draft, type Pair } from "./thresholds-draft";

// Operator settings for the alarm rules: a modal over the dashboard, opened from the top bar.

const SIDE_LABEL: Record<BoundSide, string> = { lo: "low", hi: "high" };
const FOCUSABLE = "input, button:not([disabled])";

/** Keep Tab / Shift+Tab inside the dialog. */
function trapFocus(e: React.KeyboardEvent, root: HTMLElement | null): void {
  const items = root ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function BoundInputs({ sensor, side, pair, error, onChange }: { sensor: (typeof SENSORS)[number]; side: BoundSide; pair: Pair; error: string | undefined; onChange: (next: Pair) => void }): React.JSX.Element {
  const errorId = `thr-${sensor.key}-${side}-err`;
  const input = (at: 0 | 1, level: "warning" | "critical"): React.JSX.Element => (
    <input
      type="number"
      step="any"
      inputMode="decimal"
      value={pair[at]}
      onChange={(e) => onChange(at === 0 ? [e.target.value, pair[1]] : [pair[0], e.target.value])}
      aria-label={`${sensor.label} ${SIDE_LABEL[side]} ${level} (${sensor.unit})`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="num w-20 border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-accent"
      style={{ borderLeft: `3px solid var(--st-${level})` }}
    />
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="hint w-8 uppercase">{SIDE_LABEL[side]}</span>
        {input(0, "warning")}
        {input(1, "critical")}
      </div>
      {error && (
        <span id={errorId} className="text-xs text-critical">
          {error}
        </span>
      )}
    </div>
  );
}

export function ThresholdsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { store } = useLive();
  const [draft, setDraft] = useState<Draft>(() => toDraft(getThresholds()));
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const checked = useMemo(() => checkDraft(draft), [draft]);

  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const run = (kind: "save" | "reset", request: () => Promise<Thresholds>): void => {
    setBusy(kind);
    setFailure(null);
    request()
      .then((t) => {
        // Apply locally right away; the SSE frame that follows is idempotent.
        setThresholds(t);
        store.rederive();
        onClose();
      })
      .catch((err: unknown) => {
        setFailure(err instanceof Error ? err.message : "Could not save the thresholds");
        setBusy(null);
      });
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation(); // do not also close a drawer underneath
      onClose();
    } else if (e.key === "Tab") trapFocus(e, dialog.current);
  };

  const setPair = (key: SensorKey, side: BoundSide, pair: Pair): void => setDraft((d) => ({ ...d, [key]: { ...d[key], [side]: pair } }));
  const { value } = checked;

  // The overlay doubles as the scrim; `.panel` sets position itself, so centring lives out here.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)] p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="thr-title"
        onKeyDown={onKeyDown}
        className="panel slidein flex max-h-[88vh] w-full max-w-[620px] flex-col gap-3 shadow-2xl"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="thr-title" className="ptitle">
            Alarm thresholds
          </h2>
          <span className="hint">
            <span className="text-warning">▌warning</span> · <span className="text-critical">▌critical</span> · applies to every tab
          </span>
        </div>
        <p className="text-xs text-muted">High bounds breach at or above the value, low bounds at or below. Statuses and alerts update on the next tick.</p>

        <div className="min-h-0 overflow-y-auto pr-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="hint text-left uppercase">
                <th className="py-1 font-medium">Sensor</th>
                <th className="py-1 font-medium">Warn · Crit</th>
              </tr>
            </thead>
            <tbody>
              {SENSORS.map((s) => (
                <tr key={s.key} className="border-t border-[var(--hairline)] align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {s.label} <span className="num text-xs text-muted">{s.unit}</span>
                  </th>
                  <td className="py-2">
                    <div className="flex flex-col gap-1.5">
                      {sidesOf(s.key).map((side) => {
                        const pair = draft[s.key][side];
                        return pair ? <BoundInputs key={side} sensor={s} side={side} pair={pair} error={checked.errors.get(`${s.key}.${side}`)} onChange={(p) => setPair(s.key, side, p)} /> : null;
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button type="button" onClick={() => run("reset", resetThresholds)} disabled={busy !== null} className="num border border-border px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-50">
            {busy === "reset" ? "RESETTING…" : "RESET TO DEFAULTS"}
          </button>
          <span role="status" aria-live="polite" className="flex-1 text-xs text-critical">
            {failure ?? (checked.errors.size ? `${checked.errors.size} field${checked.errors.size > 1 ? "s" : ""} to fix` : "")}
          </span>
          <button type="button" onClick={onClose} className="num border border-border px-3 py-1.5 text-xs text-muted hover:text-text">
            CANCEL
          </button>
          <button
            type="button"
            onClick={() => value && run("save", () => saveThresholds(value))}
            disabled={!value || busy !== null}
            className="num border border-accent bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            {busy === "save" ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Top-bar entry point; returns focus to itself when the dialog closes. */
export function ThresholdsButton(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = (): void => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Edit alarm thresholds"
        className="num flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-xs text-muted hover:text-text"
      >
        <span aria-hidden>⚙</span>
        THRESHOLDS
      </button>
      {open && <ThresholdsPanel onClose={close} />}
    </>
  );
}
