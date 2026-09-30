"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useLive, useNow, useTopic } from "@/hooks/useTelemetry";
import { ago } from "../status";
import { ThresholdsButton } from "../settings/ThresholdsPanel";
import { ThemeToggle } from "./ThemeToggle";

const PILL = {
  live: { text: "LIVE · SSE", color: "var(--st-normal)" },
  stale: { text: "STALE", color: "var(--st-warning)" },
  connecting: { text: "CONNECTING", color: "var(--accent-2)" },
  reconnecting: { text: "RECONNECTING", color: "var(--st-warning)" },
} as const;

export function TopBar({ query, onQuery }: { query: string; onQuery: (q: string) => void }): React.JSX.Element {
  const store = useTopic("connection");
  useTopic("summary");
  const now = useNow();
  const input = useRef<HTMLInputElement>(null);
  const pill = PILL[store.connection];

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-3">

      <div className="flex items-center gap-2.5 text-lg font-bold tracking-[.12em]">
        <span aria-hidden className="inline-block h-6 w-6 rotate-45 border-2 border-accent bg-accent/20" />
        NEXUS <span className="font-medium text-muted">OPS</span>
      </div>

      <label className="flex min-w-60 max-w-md flex-1 items-center gap-2 border border-border bg-surface px-3">
        <span aria-hidden className="text-muted">⌕</span>
        <input ref={input} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search device id, zone (DEV-0421, C2)…" aria-label="Search devices" className="num w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted" />
        <kbd className="num border border-border px-1.5 text-[11px] text-muted">/</kbd>
      </label>

      <div className="flex-1" />
      <div role="status" aria-live="polite" className="num flex items-center gap-2 border px-3 py-1.5 text-xs" style={{ color: pill.color, borderColor: `color-mix(in srgb, ${pill.color} 45%, transparent)`, background: `color-mix(in srgb, ${pill.color} 10%, transparent)` }}>

        <span aria-hidden className={`h-2 w-2 rounded-full ${store.connection === "live" ? "animate-pulse" : ""}`} style={{ background: pill.color }} />
        {pill.text}

        {store.lastFrameAt > 0 && <span className="text-muted">· updated {ago(store.lastFrameAt, now)} ago</span>}
        
      </div>

      <ThresholdsButton />
      <Link href="/model" className="num border border-border px-2.5 py-1.5 text-xs text-muted hover:text-text">
        ◇ DATA MODEL
      </Link>
      <ThemeToggle />
      <time suppressHydrationWarning className="num text-xs text-muted">
        {new Date(now).toLocaleTimeString("en-GB")}
      </time>
    </header>
  );
}

export function DisconnectedBanner(): React.JSX.Element | null {
  const { retry, retryInMs } = useLive();
  const store = useTopic("connection");
  const now = useNow();
  // Serverless hosts end the stream every few minutes by design; only surface a gap that lasts.
  if (store.connection !== "reconnecting" && store.connection !== "stale") return null;
  if (store.connection === "reconnecting" && now - store.connectionSince < 3000) return null;
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-5 py-2 text-sm text-warning">
      <span aria-hidden>▲</span>
      <span>
        {store.connection === "stale" ? "Live stream is quiet" : "Live stream interrupted — reconnecting"}
        {retryInMs ? ` in ${Math.ceil(retryInMs / 1000)}s` : "…"} · last update {store.lastFrameAt ? ago(store.lastFrameAt, now) : "—"} ago · data shown is dimmed, not lost
      </span>
      <button type="button" onClick={retry} className="ml-auto border border-warning/60 px-3 py-0.5 text-xs font-semibold tracking-wider hover:bg-warning/20">
        RETRY NOW
      </button>
    </div>
  );
}
