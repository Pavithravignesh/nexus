import type { StatusCode } from "@/shared/status";

// Status is never colour alone: colour + icon + label everywhere.
export const STATUS_UI: Record<StatusCode, { label: string; icon: string; color: string }> = {
  0: { label: "NORMAL", icon: "●", color: "var(--st-normal)" },
  1: { label: "WARNING", icon: "▲", color: "var(--st-warning)" },
  2: { label: "CRITICAL", icon: "⬣", color: "var(--st-critical)" },
  3: { label: "OFFLINE", icon: "⦸", color: "var(--st-offline)" },
};

export const SEVERITY_CODE = { NORMAL: 0, WARNING: 1, CRITICAL: 2, OFFLINE: 3 } as const;

export const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function StatusBadge({ code }: { code: StatusCode }): React.JSX.Element {
  const s = STATUS_UI[code];
  return (
    <span className="inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] font-semibold tracking-wider" style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 45%, transparent)`, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}
