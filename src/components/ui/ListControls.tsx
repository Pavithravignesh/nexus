"use client";

// Small shared controls for list toolbars (alerts, activity feed, device timeline).

export function SearchInput({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 border border-border bg-surface px-2">
      <span aria-hidden className="text-muted">
        ⌕
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className="num w-full min-w-0 bg-transparent py-1 text-[11px] outline-none placeholder:text-muted" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label={`Clear ${label.toLowerCase()}`} className="text-muted hover:text-[var(--text)]">
          ✕
        </button>
      )}
    </label>
  );
}

export function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  const c = color ?? "var(--accent)";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="num border px-1.5 py-0.5 text-[10px] tracking-wider uppercase"
      style={on ? { color: c, borderColor: `color-mix(in srgb, ${c} 55%, transparent)`, background: `color-mix(in srgb, ${c} 12%, transparent)` } : { color: "var(--text-muted)", borderColor: "var(--border)", opacity: 0.6 }}
    >
      {children}
    </button>
  );
}

export function MiniSelect<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }): React.JSX.Element {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="num border border-border bg-surface px-1 py-0.5 text-[11px] text-[var(--text)]">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
