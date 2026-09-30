"use client";

import { useState } from "react";
import { useTopic } from "@/hooks/useTelemetry";
import { ALL_FEED_KINDS, ALL_SEVERITIES, filterFeed, toggleInSet, type FeedKind } from "@/lib/list-filters";
import { paginate } from "@/lib/pagination";
import { FEED_CAPACITY } from "@/lib/telemetry-store";
import type { AlertSeverity } from "@/shared/types";
import { SEVERITY_CODE, STATUS_UI, fmt } from "../status";
import { Chip, SearchInput } from "../ui/ListControls";
import { Pagination } from "../ui/Pagination";

const KIND_COLOR: Record<FeedKind, string> = { raised: "var(--st-critical)", cleared: "var(--st-normal)", acked: "var(--accent-2)" };

/** Alert transitions seen by this browser (newest first), searchable and paged. */
export function ActivityFeed({ onOpen, matches }: { onOpen: (idx: number) => void; matches: (idx: number) => boolean }): React.JSX.Element {
  const store = useTopic("alerts");
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<ReadonlySet<FeedKind>>(new Set(ALL_FEED_KINDS));
  const [severities, setSeverities] = useState<ReadonlySet<AlertSeverity>>(new Set(ALL_SEVERITIES));
  const [size, setSize] = useState(10);
  const [pageState, setPageState] = useState({ view: "", page: 0 });

  const inView = store.feed.filter((f) => matches(f.alert.deviceIdx));
  const list = filterFeed(inView, store.devices, { q, kinds, severities });
  const view = `${q}|${[...kinds].join()}|${[...severities].join()}|${size}`;
  const page = paginate(list, pageState.view === view ? pageState.page : 0, size);

  return (
    <section aria-label="Activity feed" className="panel flex min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="ptitle">Activity feed</h2>
        <span className="hint">last {FEED_CAPACITY} transitions in this session</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SearchInput value={q} onChange={setQ} label="Search activity" placeholder="Device, sensor, zone…" />
        {ALL_FEED_KINDS.map((k) => (
          <Chip key={k} on={kinds.has(k)} color={KIND_COLOR[k]} onClick={() => setKinds((set) => toggleInSet(set, k))}>
            {k}
          </Chip>
        ))}
        {ALL_SEVERITIES.map((s) => (
          <Chip key={s} on={severities.has(s)} color={STATUS_UI[SEVERITY_CODE[s]].color} onClick={() => setSeverities((set) => toggleInSet(set, s))}>
            {STATUS_UI[SEVERITY_CODE[s]].icon}
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{store.feed.length === 0 ? "Waiting for the first transitions…" : "No activity matches these filters."}</p>
      ) : (
        <ul className="num flex flex-col text-[11px]">
          {page.items.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onOpen(f.alert.deviceIdx)} className="grid w-full grid-cols-[64px_64px_1fr] gap-2 border-b border-[var(--hairline)] py-1 text-left hover:bg-[var(--wash)]">
                <span className="text-muted">{new Date(f.ts).toLocaleTimeString("en-GB")}</span>
                <span style={{ color: KIND_COLOR[f.kind] }}>{f.kind.toUpperCase()}</span>
                <span className="truncate">
                  <span style={{ color: STATUS_UI[SEVERITY_CODE[f.alert.severity]].color }}>{STATUS_UI[SEVERITY_CODE[f.alert.severity]].icon}</span> {f.alert.deviceId} · {f.alert.sensor ?? "offline"}
                  {f.alert.value !== null && ` ${fmt(f.alert.value)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} size={size} sizes={[10, 25, 50]} label="Activity" onPage={(p) => setPageState({ view, page: p })} onSize={setSize} />
    </section>
  );
}
