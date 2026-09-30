"use client";

import { useState } from "react";
import { describeFilters, useSavedViews, type ViewFilters } from "@/hooks/useSavedViews";
import { SENSORS } from "@/shared/sensors";
import { STATUS_NAMES } from "@/shared/status";

const SENSOR_LABELS = SENSORS.map((s) => s.label);

/** Save the current filter set under a name and recall it with one click. */
export function SavedViews({ current, canSave, onApply }: { current: ViewFilters; canSave: boolean; onApply: (f: ViewFilters) => void }): React.JSX.Element {
  const { views, save, remove } = useSavedViews();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a name");
      return;
    }
    save(name, current);
    setNaming(false);
    setName("");
    setError(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.map((v) => (
        <span key={v.name} className="inline-flex items-stretch border border-accent-2/50 text-accent-2">
          <button type="button" onClick={() => onApply(v.filters)} title={describeFilters(v.filters, SENSOR_LABELS, STATUS_NAMES)} className="px-2 py-1 hover:bg-accent-2/15">
            ★ {v.name}
          </button>
          <button type="button" onClick={() => remove(v.name)} aria-label={`Delete saved view ${v.name}`} className="border-l border-accent-2/40 px-1.5 hover:bg-critical/20 hover:text-critical">
            ✕
          </button>
        </span>
      ))}
      {naming ? (
        <form onSubmit={submit} className="flex items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            maxLength={32}
            placeholder="Hall 2 critical"
            aria-label="Saved view name"
            aria-invalid={Boolean(error)}
            className="w-36 border border-border bg-surface px-2 py-1 text-text outline-none focus:border-accent"
          />
          <button type="submit" className="border border-accent px-2 py-1 text-accent hover:bg-accent/15">
            Save
          </button>
          <button type="button" onClick={() => setNaming(false)} className="px-1 text-muted hover:text-text">
            Cancel
          </button>
          {error && (
            <span role="alert" className="text-critical">
              {error}
            </span>
          )}
        </form>
      ) : (
        canSave && (
          <button type="button" onClick={() => setNaming(true)} className="border border-border px-2 py-1 hover:text-text">
            ☆ Save view
          </button>
        )
      )}
    </div>
  );
}
