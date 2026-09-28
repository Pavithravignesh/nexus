# UI system

## Status tokens (both themes)

| Status | Token | Dark | Light | Icon (lucide) | Extra cue |
|---|---|---|---|---|---|
| NORMAL | `--st-normal` | #2BD17E | #0F9D58 | `CircleCheck` | none |
| WARNING | `--st-warning` | #F5B83D | #B7791F | `TriangleAlert` | none |
| CRITICAL | `--st-critical` | #FF5C5C | #D92D20 | `OctagonAlert` | bold label, left accent bar |
| OFFLINE | `--st-offline` | #7C8798 | #667085 | `Unplug` | dashed border, values dimmed |
| STALE | (derived) | 55% opacity | 55% opacity | `Clock` | "12s ago" |

Each token has a `-bg` variant (10–14% alpha) for chips and heatmap cells.

## Surface tokens

| Token | Dark (default) | Light |
|---|---|---|
| `--bg` | #0B0F17 | #F5F7FA |
| `--surface` | #121826 | #FFFFFF |
| `--surface-2` | #1A2233 | #F0F2F6 |
| `--border` | #243047 | #E3E7EE |
| `--text` | #E6EAF2 | #111827 |
| `--text-muted` | #8C97AB | #5B6475 |
| `--accent` | #4C8DFF | #2563EB |

## Type and spacing

- Font: Inter (UI), JetBrains Mono (ids, values) via `next/font`. Tabular numbers everywhere.
- Scale: 12 / 13 / 14 (body) / 16 / 20 / 28 (KPI value).
- Spacing: 4-pt grid; card padding 16; grid gap 16; radius 10 cards, 6 chips.
- Layout grid: 12 columns, max width 1920, laptop target 1366–1536 wide.

## Components

- **KpiCard:** label, big value, delta vs 5 min ago, sparkline, click = apply filter.
- **StatusBadge:** icon + label + colour; compact variant = dot + icon only with tooltip.
- **AlertItem:** severity bar, device name + location, sensor + value + threshold, age,
  Ack / Open buttons. Critical sorted first, then newest.
- **ZoneHeatmap:** floors (rows) x zones (cols); cell colour = worst share; text = count
  of critical/warning; click = filter table + highlight.
- **DeviceDrawer:** right side, 480 px, focus-trapped, `Esc` closes; header with status and
  location breadcrumb; 10 SensorTiles (value, unit, status, mini sparkline); TimeSeriesChart
  with sensor switcher and threshold bands; device event timeline.
- **Skeleton:** matches final geometry of every panel (no layout shift).
- **DisconnectedBanner:** amber strip under the top bar: "Live stream interrupted —
  reconnecting in 4s · last update 12s ago · Retry now".

## Motion

150–200 ms ease-out for hover/focus; 600 ms value flash; drawer 220 ms slide.
All disabled under `prefers-reduced-motion`.

## Chosen direction (2026-09-28): Industrial 3D Control Room

Approved from `docs/design/style-directions.html` (variant C). This overrides the colour
tables above where they differ.

- Palette: bg #0A0907, surface #14110C, border rgba(255,138,0,.22), text #F2E9DC, muted #A0927C,
  accent #FF8A00 (amber), accent-2 #34D1FF; status ok #3DDC84, warn #FFD23F, crit #FF3B3B, offline #6B6459.
- Type: Rajdhani (labels, uppercase + letter-spacing for panel titles), JetBrains Mono (numbers, ids).
- Surfaces: square corners, 1 px amber border, corner brackets on panels, faint scanlines.
- Hero: three.js control room (4 halls × 6 zones × 3 racks, one LED per device, one InstancedMesh
  for all 10,000; rack top strip = zone status). Click zone = filter, click LED = drawer, ctrl+scroll zoom.
- Fleet health: health-index line (top) + stacked incident bars per 3 s (bottom), hover crosshair, legend toggles.
- Status distribution: 10,000-cell LED matrix (canvas, grouped by floor/zone) + segmented status bar (click = filter).
- Keep: KPI strip with sparklines, alerts panel (critical first), breach radar, zone heatmap, gauges,
  device table (sort, filter, pause-on-hover), drawer with time series + threshold bands, data-model tab.
- Dependencies this adds to the real build: `three` (+ OrbitControls, UnrealBloomPass from `three/examples/jsm`).
