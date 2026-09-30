"use client";

import { useState } from "react";
import { BOX_W, ENTITIES, ENTITY_NAMES, ERD_H, ERD_W, RELATIONS, STORAGE_UI, boxHeight, related, type EntityName, type Storage } from "./model-data";

const center = (k: EntityName): { x: number; y: number } => {
  const e = ENTITIES[k];
  return { x: e.x + BOX_W / 2, y: e.y + boxHeight(e) / 2 };
};

const LEGEND: Storage[] = ["mongo", "memory", "wire", "code"];

/** Entity-relationship diagram. Hover (or focus) highlights an entity and its relations; click selects. */
export function ErdDiagram({ selected, onSelect }: { selected: EntityName; onSelect: (e: EntityName) => void }): React.JSX.Element {
  const [hover, setHover] = useState<EntityName | null>(null);
  const focus = hover ?? selected;
  const { ents } = related(focus);

  return (
    <svg viewBox={`0 0 ${ERD_W} ${ERD_H}`} role="group" aria-label="Entity-relationship diagram" className="block h-auto w-full select-none">
      <style>{`
        .erd-flow { stroke-dasharray: 6 6; animation: erd-dash 1s linear infinite; }
        @keyframes erd-dash { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) { .erd-flow { animation: none; } }
        .erd-ent { cursor: pointer; outline: none; transition: opacity .18s ease-out; }
        .erd-ent:focus-visible rect.erd-box { stroke: var(--accent); stroke-width: 2.5; }
      `}</style>

      {RELATIONS.map((r) => {
        const a = center(r.from);
        const b = center(r.to);
        const on = r.from === focus || r.to === focus;
        const my = (a.y + b.y) / 2;
        const color = on ? "var(--accent)" : "var(--border)";
        return (
          <g key={`${r.from}-${r.to}`}>
            <path d={`M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`} className={on ? "erd-flow" : undefined} style={{ fill: "none", stroke: color, strokeWidth: on ? 2 : 1.2 }} />
            <text x={(a.x + b.x) / 2} y={my - 5} textAnchor="middle" className="num" style={{ fontSize: 11, fill: on ? "var(--text)" : "var(--text-muted)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 5 }}>
              {r.label}
            </text>
          </g>
        );
      })}

      {ENTITY_NAMES.map((k) => {
        const e = ENTITIES[k];
        const h = boxHeight(e);
        const c = STORAGE_UI[e.storage].color;
        const sel = k === selected;
        return (
          <g
            key={k}
            className="erd-ent"
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            aria-label={`${k}, stored in ${e.where}`}
            opacity={ents.has(k) ? 1 : 0.42}
            onMouseEnter={() => setHover(k)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(k)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(k)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onSelect(k);
              }
            }}
          >
            <rect className="erd-box" x={e.x} y={e.y} width={BOX_W} height={h} style={{ fill: "var(--surface)", stroke: sel ? c : "var(--border)", strokeWidth: sel ? 2 : 1 }} />
            <rect x={e.x} y={e.y} width={BOX_W} height={28} style={{ fill: c, fillOpacity: 0.18 }} />
            <text x={e.x + 10} y={e.y + 19} style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".06em", fill: "var(--text)" }}>
              {k}
            </text>
            <text x={e.x + BOX_W - 8} y={e.y + 18} textAnchor="end" className="num" style={{ fontSize: 9.5, fill: c, textTransform: "uppercase" }}>
              {STORAGE_UI[e.storage].label}
            </text>
            {e.fields.map((f, i) => (
              <text key={f} x={e.x + 10} y={e.y + 47 + i * 18} className="num" style={{ fontSize: 11, fill: /PK|FK/.test(f) ? c : "var(--text-muted)" }}>
                {f}
              </text>
            ))}
          </g>
        );
      })}

      <g aria-label="Storage legend">
        {LEGEND.map((s, i) => (
          <g key={s} transform={`translate(${16 + i * 130}, ${ERD_H - 18})`}>
            <rect width={11} height={11} style={{ fill: STORAGE_UI[s].color, fillOpacity: 0.7 }} />
            <text x={17} y={10} style={{ fontSize: 12, fill: "var(--text)" }}>
              {STORAGE_UI[s].label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
