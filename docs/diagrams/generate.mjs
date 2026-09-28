// Generates docs/diagrams/*.excalidraw from compact layout code.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const C = {
  ink: "#1e1e1e", muted: "#495057", blue: "#a5d8ff", green: "#b2f2bb", yellow: "#ffec99",
  red: "#ffc9c9", gray: "#e9ecef", violet: "#d0bfff", orange: "#ffd8a8", teal: "#96f2d7",
  white: "#ffffff", dark: "#343a40", redInk: "#e03131", amberInk: "#f08c00", greenInk: "#2f9e44",
  blueInk: "#1971c2", grayInk: "#868e96", violetInk: "#6741d9",
};

function makeScene() {
  const els = [];
  let n = 0;
  const base = (type, x, y, w, h, o = {}) => ({
    id: `${type}-${++n}-${Math.random().toString(36).slice(2, 8)}`,
    type, x, y, width: w, height: h, angle: 0,
    strokeColor: o.stroke ?? C.ink, backgroundColor: o.fill ?? "transparent",
    fillStyle: o.fillStyle ?? "solid", strokeWidth: o.sw ?? 1,
    strokeStyle: o.dashed ? "dashed" : o.dotted ? "dotted" : "solid",
    roughness: o.rough ?? 1, opacity: o.opacity ?? 100, groupIds: [], frameId: null,
    roundness: o.round === false ? null : { type: 3 }, seed: Math.floor(Math.random() * 2 ** 31),
    version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31), isDeleted: false,
    boundElements: null, updated: 1759050000000, link: null, locked: false,
  });
  const measure = (str, size) => {
    const lines = String(str).split("\n");
    return { w: Math.max(...lines.map((l) => l.length)) * size * 0.56, h: lines.length * size * 1.25 };
  };
  const text = (x, y, str, o = {}) => {
    const size = o.size ?? 16;
    const m = measure(str, size);
    let tx = x;
    if (o.align === "center") tx = x - m.w / 2;
    if (o.align === "right") tx = x - m.w;
    els.push({
      ...base("text", tx, y, m.w, m.h, { stroke: o.color ?? C.ink, round: false }),
      text: str, originalText: str, fontSize: size, fontFamily: o.font ?? 1,
      textAlign: o.align ?? "left", verticalAlign: "top", containerId: null,
      lineHeight: 1.25, autoResize: true, baseline: size,
    });
    return m;
  };
  const rect = (x, y, w, h, o = {}) => {
    els.push(base(o.ellipse ? "ellipse" : "rectangle", x, y, w, h, o));
    if (o.label) {
      const size = o.size ?? 16;
      const m = measure(o.label, size);
      const ty = o.top ? y + 10 : y + (h - m.h) / 2;
      if (o.left) text(x + 12, ty, o.label, { size, color: o.color, font: o.font });
      else text(x + w / 2, ty, o.label, { size, align: "center", color: o.color, font: o.font });
    }
  };
  const arrow = (x1, y1, x2, y2, o = {}) => {
    const pts = o.via ? [[0, 0], ...o.via.map(([vx, vy]) => [vx - x1, vy - y1]), [x2 - x1, y2 - y1]] : [[0, 0], [x2 - x1, y2 - y1]];
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
    els.push({
      ...base("arrow", x1, y1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys),
        { stroke: o.stroke ?? C.ink, sw: o.sw ?? 2, dashed: o.dashed, round: false }),
      roundness: { type: 2 }, points: pts, lastCommittedPoint: null, startBinding: null, endBinding: null,
      startArrowhead: o.both ? "arrow" : null, endArrowhead: "arrow", elbowed: false,
    });
    if (o.label) {
      const [lx, ly] = o.labelAt ?? [(x1 + x2) / 2, (y1 + y2) / 2 - 24];
      text(lx, ly, o.label, { size: o.size ?? 14, align: "center", color: o.labelColor ?? C.muted });
    }
  };
  const line = (x1, y1, x2, y2, o = {}) => {
    els.push({
      ...base("line", x1, y1, Math.abs(x2 - x1), Math.abs(y2 - y1), { stroke: o.stroke ?? C.ink, sw: o.sw ?? 1, dashed: o.dashed, round: false }),
      points: [[0, 0], [x2 - x1, y2 - y1]], lastCommittedPoint: null, startBinding: null, endBinding: null,
      startArrowhead: null, endArrowhead: null,
    });
  };
  const save = (name) => {
    writeFileSync(join(OUT, name), JSON.stringify({
      type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: els,
      appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {},
    }, null, 2));
  };
  return { text, rect, arrow, line, save };
}

/* ---------------------------------------------------------------- 1. HLD */
{
  const { text, rect, arrow, save } = makeScene();
  text(40, 20, "Nexus Ops Dashboard — High-Level Design", { size: 32 });
  text(40, 66, "One deployable Next.js app (Node runtime) · MongoDB · real-time via Server-Sent Events · no polling", { size: 16, color: C.muted });

  // Browser
  rect(40, 120, 420, 640, { fill: C.gray, fillStyle: "hachure", label: "Operator browser (laptop / NOC screen)", top: true, size: 18 });
  rect(70, 170, 360, 150, { fill: C.blue, label: "Dashboard UI (React 19, Tailwind)\nKPIs · Health · Alerts · Heatmap\nSensor bars · Device table · Drawer", size: 16 });
  rect(70, 350, 360, 110, { fill: C.violet, label: "TelemetryStore (outside React)\n10k devices in typed arrays\nrAF-batched notifications", size: 16 });
  rect(70, 490, 170, 110, { fill: C.white, label: "useSnapshot\nREST, once +\nafter reconnect", size: 15 });
  rect(260, 490, 170, 110, { fill: C.white, label: "useLiveStream\nEventSource\nbackoff + states", size: 15 });
  rect(70, 630, 360, 100, { fill: C.yellow, label: "Connection states\nconnecting · live · stale · reconnecting", size: 15 });
  arrow(250, 460, 250, 350 + 0, { stroke: C.violetInk, sw: 1 });
  arrow(250, 350, 250, 320, { stroke: C.violetInk });
  arrow(155, 490, 155, 460, { stroke: C.violetInk });
  arrow(345, 490, 345, 460, { stroke: C.violetInk });

  // Server
  rect(600, 120, 600, 640, { fill: C.gray, fillStyle: "hachure", label: "Next.js 16 server (Node.js runtime, single process)", top: true, size: 18 });
  rect(630, 170, 260, 250, { fill: C.teal, label: "REST API (thin routes)\n\nGET /api/summary\nGET /api/devices\nGET /api/devices/{id}\nGET /api/devices/{id}/history\nGET /api/telemetry/latest\nGET /api/health", size: 15 });
  rect(910, 170, 260, 120, { fill: C.orange, label: "SSE  GET /api/stream\nhello · summary · delta\nalert · heartbeat", size: 15 });
  rect(910, 310, 260, 110, { fill: C.orange, label: "Stream hub\nserialize once per tick\nfan-out to N clients", size: 15 });
  rect(630, 450, 540, 80, { fill: C.white, label: "Services: summary · devices (search/filter/sort) · history · alerts", size: 15 });
  rect(630, 560, 540, 170, { fill: C.green, label: "Simulator engine (singleton, starts in instrumentation.ts)\n\n10,000 devices × 10 sensor types = 100,000 readings\ntick every 1 s · ~10% devices change per tick\nanomaly episodes · offline flaps · thresholds → status\nin-memory state + 15-min history ring buffer", size: 15 });
  arrow(1040, 560, 1040, 420, { stroke: C.greenInk, label: "emit tick", labelAt: [1095, 500] });
  arrow(1040, 310, 1040, 290, { stroke: C.amberInk });
  arrow(760, 450, 760, 420, { stroke: C.ink, sw: 1 });
  arrow(900, 530, 900, 560, { stroke: C.ink, sw: 1, both: true });

  // DB
  rect(1340, 170, 300, 400, { fill: C.gray, fillStyle: "hachure", label: "MongoDB (local mongod)", top: true, size: 18 });
  rect(1365, 220, 250, 90, { fill: C.white, label: "devices (10,000)\nmetadata + location", size: 15 });
  rect(1365, 330, 250, 90, { fill: C.white, label: "latest_readings (100,000)\nupsert of dirty keys", size: 15 });
  rect(1365, 440, 250, 100, { fill: C.white, label: "events (TTL 24 h)\nraised · cleared\noffline · online", size: 15 });

  // Flows
  arrow(460, 250, 630, 250, { stroke: C.blueInk, label: "① snapshot (JSON)", labelAt: [545, 222], both: true });
  arrow(910, 230, 460, 540, { stroke: C.amberInk, sw: 3, via: [[520, 230], [520, 540]], label: "② SSE frames 1/s\nsummary + delta + alerts", labelAt: [540, 360] });
  arrow(1170, 650, 1365, 380, { stroke: C.greenInk, via: [[1280, 650], [1280, 380]], label: "③ bulkWrite every 5 s", labelAt: [1290, 660] });
  arrow(1170, 480, 1365, 260, { stroke: C.blueInk, dashed: true, via: [[1250, 480], [1250, 260]], label: "reads: search,\nfilter, details", labelAt: [1245, 300] });

  // Legend / facts
  rect(40, 800, 1600, 130, { fill: C.yellow, fillStyle: "solid", round: true });
  text(60, 812, "Key decisions", { size: 18 });
  text(60, 842, "• SSE over WebSocket: one-way server → client is all we need, auto-reconnect built into EventSource, plain HTTP (bonus in brief).\n• One simulator for the whole fleet + hub fan-out (many tabs ≠ many fleets). Frames serialized once per tick.\n• Hot state in memory, MongoDB for persistence (devices, latest readings, events). History from ring buffer; at scale → Mongo time-series.", { size: 15 });
  save("01-hld.excalidraw");
}

/* ---------------------------------------------------------------- 2. Architecture */
{
  const { text, rect, arrow, save } = makeScene();
  text(40, 20, "Nexus Ops Dashboard — Architecture & Data Flow", { size: 32 });
  text(40, 66, "Layers, module ownership and the per-tick pipeline", { size: 16, color: C.muted });

  // Client column
  rect(40, 120, 560, 700, { fill: C.blue, fillStyle: "hachure", label: "CLIENT  (src/app, components, hooks, lib)", top: true, size: 18 });
  const client = [
    ["Page shell  app/page.tsx", "TopBar · ConnectionPill · ThemeToggle · DisconnectedBanner", C.white],
    ["Panels  components/*", "KpiStrip · FleetHealthArea · StatusDonut · ZoneHeatmap\nSensorBreachBars · AlertsPanel · ActivityFeed\nDeviceTable (virtual) · DeviceDrawer + TimeSeriesChart", C.white],
    ["Selectors  hooks/useTelemetry.ts", "useSummary · useDeviceRow(idx) · useSortedIndex(filters)\nuseSyncExternalStore → only changed parts re-render", C.violet],
    ["TelemetryStore  lib/telemetry-store.ts", "typed arrays: status · lastSeen · values[10k×10]\napplyDelta → dirty set → requestAnimationFrame notify", C.violet],
    ["Transport  hooks/useSnapshot · useLiveStream", "fetchJson (envelope) · EventSource + zod parse\nstate machine: connecting → live → stale → reconnecting", C.white],
  ];
  let y = 165;
  for (const [h, b, fill] of client) {
    rect(70, y, 500, 118, { fill });
    text(85, y + 10, h, { size: 16 });
    text(85, y + 38, b, { size: 14, color: C.muted });
    if (y > 165) arrow(320, y, 320, y - 12, { sw: 1 });
    y += 130;
  }

  // Server column
  rect(760, 120, 560, 700, { fill: C.green, fillStyle: "hachure", label: "SERVER  (src/app/api, src/server)", top: true, size: 18 });
  const server = [
    ["Route handlers  app/api/**", "thin: zod-parse query → one service → { ok, data }\n/api/stream: subscribe to hub, heartbeat, cleanup on abort", C.white],
    ["Services  server/services", "summary · devices (search/filter/sort/paginate)\nhistory (slice ring buffer) · stream-hub (EventEmitter)", C.white],
    ["Simulator  server/sim", "fleet.ts (seeded 10k devices) · generators.ts (walk,\nanomalies, offline) · engine.ts (tick, transitions)", C.orange],
    ["Repos  server/repos", "devices · readings (bulkWrite unordered) · events\nthe ONLY files with Mongo query syntax", C.white],
    ["DB  server/db", "one MongoClient (globalThis cache) · collections · indexes", C.white],
  ];
  y = 165;
  for (const [h, b, fill] of server) {
    rect(790, y, 500, 118, { fill });
    text(805, y + 10, h, { size: 16 });
    text(805, y + 38, b, { size: 14, color: C.muted });
    if (y > 165) arrow(1040, y, 1040, y - 12, { sw: 1 });
    y += 130;
  }

  // Shared
  rect(1400, 120, 300, 700, { fill: C.yellow, fillStyle: "hachure", label: "SHARED  src/shared", top: true, size: 18 });
  rect(1420, 170, 260, 90, { fill: C.white, label: "sensors.ts\nunits · decimals · thresholds", size: 14 });
  rect(1420, 280, 260, 90, { fill: C.white, label: "status.ts (pure, tested)\nreading → device status", size: 14 });
  rect(1420, 390, 260, 90, { fill: C.white, label: "summarize.ts (pure, tested)\nKPIs · per zone · per sensor", size: 14 });
  rect(1420, 500, 260, 110, { fill: C.white, label: "schemas/ (zod)\ndevice · summary · delta\nalert · envelope", size: 14 });
  rect(1420, 630, 260, 90, { fill: C.white, label: "types.ts\nz.infer everywhere", size: 14 });
  text(1550, 740, "imported by BOTH sides\nno Node-only imports", { size: 14, align: "center", color: C.muted });

  arrow(600, 690, 760, 230, { stroke: C.blueInk, via: [[680, 690], [680, 230]], both: true, label: "REST JSON", labelAt: [680, 450] });
  arrow(760, 260, 600, 720, { stroke: C.amberInk, sw: 3, via: [[720, 260], [720, 720]], label: "SSE", labelAt: [745, 520] });
  text(1320, 450, "→", { size: 30 });
  text(560, 450, "", { size: 10 });

  // Tick pipeline
  text(40, 860, "Per-tick pipeline (every 1 s)", { size: 22 });
  const steps = [
    ["1 tick", C.orange], ["2 update ~1,000\ndevices", C.orange], ["3 deriveStatus\n+ transitions", C.orange],
    ["4 alerts/events\n+ summarize", C.orange], ["5 pack delta\nserialize once", C.orange], ["6 hub → N\nSSE clients", C.orange],
    ["7 zod parse\napplyDelta", C.violet], ["8 rAF notify\ndirty rows only", C.violet], ["9 visible rows +\npanels re-render", C.blue],
  ];
  let x = 40;
  for (const [s, fill] of steps) {
    rect(x, 900, 165, 80, { fill, label: s, size: 14 });
    if (x > 40) arrow(x - 22, 940, x - 2, 940, { sw: 1 });
    x += 187;
  }
  text(40, 1000, "Side path: every 5 s the engine flushes dirty readings + new events to MongoDB via bulkWrite (never per tick, never row by row).", { size: 15, color: C.muted });

  // Reconnect
  rect(40, 1040, 1660, 80, { fill: C.red, fillStyle: "solid" });
  text(60, 1052, "Disconnect / reconnect:  error → banner \"reconnecting in Ns\" (backoff 1→30 s + jitter) · data kept but dimmed · 'last update 12s ago'\n→ on reopen: one snapshot reload (not polling) → store replaced → stream resumes from next seq · readings older than 10 s = stale, 30 s = offline", { size: 15 });
  save("02-architecture.excalidraw");
}


/* ---------------------------------------------------------------- 3. Wireframe v2 (Industrial 3D Control Room) */
{
  const { text, rect, line, save } = makeScene();
  const AMB = "#f08c00", AMBF = "#ffe8cc", M = C.muted;
  const panel = (x, y, w, h, title, hint) => {
    rect(x, y, w, h, { fill: C.white, stroke: AMB, round: false });
    line(x - 2, y - 2, x + 14, y - 2, { stroke: AMB, sw: 3 }); line(x - 2, y - 2, x - 2, y + 14, { stroke: AMB, sw: 3 });
    line(x + w + 2, y + h + 2, x + w - 14, y + h + 2, { stroke: AMB, sw: 3 }); line(x + w + 2, y + h + 2, x + w + 2, y + h - 14, { stroke: AMB, sw: 3 });
    text(x + 12, y + 10, title.toUpperCase(), { size: 14 });
    if (hint) text(x + w - 12, y + 12, hint, { size: 11, color: M, align: "right" });
  };
  text(40, 0, "Nexus Ops Dashboard — Wireframe v2 · Industrial 3D Control Room (laptop 1440 wide)", { size: 26 });
  text(40, 36, "Approved from docs/design/style-directions.html · dark amber theme · square panels with corner brackets · every chart is interactive and cross-filters", { size: 14, color: M });
  const X = 40, Y = 70, W = 1440;
  rect(X, Y, W, 1640, { fill: C.white, sw: 2, round: false });

  // Top bar
  rect(X, Y, W, 56, { fill: C.dark, round: false });
  text(X + 20, Y + 17, "◆ NEXUS OPS", { size: 18, color: C.white });
  rect(X + 190, Y + 12, 190, 32, { fill: C.dark, stroke: AMB, label: "[Overview]  Data model", size: 13, color: C.white, round: false });
  rect(X + 400, Y + 12, 420, 32, { fill: C.white, round: false, label: "Search device id, zone (DEV-0421, C2)…   /", left: true, size: 13, color: C.grayInk });
  rect(X + 1060, Y + 12, 220, 32, { fill: C.green, round: false, label: "● LIVE · SSE · 0.4s (Space = pause)", size: 12 });
  text(X + 1300, Y + 20, "14:05:12 IST", { size: 13, color: C.white });
  text(X + 20, Y + 66, "Filters:  [Status: CRITICAL ✕]  [Zone C · Floor 2 ✕]  [Clear all]   <- chips appear when any chart, KPI or alert is clicked", { size: 13, color: AMB });

  // KPI strip
  const kpis = [["TOTAL DEVICES", "10,000", "10 sensors · 24 zones", C.gray], ["NORMAL", "9,547", "95.5% of fleet", C.green], ["WARNING", "222", "▼ 16 in 60 s", C.yellow],
    ["CRITICAL", "62", "▼ 8 in 60 s", C.red], ["OFFLINE", "169", "▼ 55 in 60 s", C.gray], ["READINGS / SEC", "13,410", "delta frame · 1 Hz", C.violet]];
  const kw = (W - 40 - 5 * 16) / 6, KY = Y + 96; let kx = X + 20;
  kpis.forEach(([l, v, d, fill]) => {
    rect(kx, KY, kw, 100, { fill, round: false, stroke: AMB });
    text(kx + 14, KY + 10, l, { size: 12, color: M }); text(kx + 14, KY + 32, v, { size: 28 }); text(kx + 14, KY + 72, d, { size: 12, color: M });
    line(kx + kw - 100, KY + 80, kx + kw - 70, KY + 66); line(kx + kw - 70, KY + 66, kx + kw - 45, KY + 74); line(kx + kw - 45, KY + 74, kx + kw - 14, KY + 56);
    kx += kw + 16;
  });
  text(X + 20, KY + 106, "click KPI = filter by status · sparkline = last 60 s", { size: 11, color: C.blueInk });

  // Row 1: 3D control room + alerts
  const R1 = KY + 130, mainW = 940, AX = X + 20 + mainW + 16, AW = W - 40 - mainW - 16;
  panel(X + 20, R1, mainW, 500, "Industrial 3D Control Room", "Auto-orbit · Reset view");
  text(X + 36, R1 + 32, "4 halls × 6 zones × 3 racks · one LED per device (10,000 in one InstancedMesh)", { size: 12, color: M });
  text(X + 36, R1 + 52, "● Normal  ● Warning  ● Critical  ● Offline", { size: 12, color: M });
  const zc = [[C.yellow, C.green, C.red, C.green, C.green, C.yellow], [C.green, C.green, C.yellow, C.green, C.red, C.green], [C.green, C.yellow, C.green, C.green, C.green, C.green], [C.green, C.green, C.green, C.yellow, C.green, C.green]];
  for (let f = 0; f < 4; f++) {
    const yy = R1 + 110 + f * 88, skew = f * 22;
    text(X + 40, yy + 30, "HALL " + (4 - f), { size: 12, color: AMB });
    for (let c = 0; c < 6; c++) {
      const xx = X + 120 + skew + c * 128;
      for (let r = 0; r < 3; r++) {
        rect(xx + r * 36, yy + 12, 32, 58, { fill: C.dark, round: false, stroke: C.dark });
        for (let d = 0; d < 6; d++) {
          const led = (c + d + r + f) % 11 === 0 ? C.redInk : (c * d + f) % 9 === 0 ? C.amberInk : C.greenInk;
          line(xx + r * 36 + 6, yy + 22 + d * 8, xx + r * 36 + 26, yy + 22 + d * 8, { stroke: led, sw: 2, dotted: true });
        }
      }
      rect(xx, yy + 4, 104, 8, { fill: zc[3 - f][c], round: false, rough: 0 });
      text(xx + 40, yy - 12, "ABCDEF"[c] + (4 - f), { size: 11, color: M });
    }
  }
  rect(X + 780, R1 + 400, 150, 44, { fill: C.white, round: false, label: "⬣ 62 · ▲ 222 · ⦸ 169\nseq 1842", size: 11 });
  text(X + 36, R1 + 478, "drag = orbit · ctrl + scroll = zoom · hover LED/rack = tooltip · click zone = filter all · click LED = device drawer", { size: 12, color: M });

  panel(AX, R1, AW, 500, "Live alerts", "62 critical · 222 warning");
  const al = [[C.red, "⬣ CO2 1,650 ppm > 1,500", "DEV-04211 · F2 › Zone C › R-12", "8s"], [C.red, "⬣ Temp 36.2 °C > 35", "DEV-00917 · F1 › Zone A › R-03", "21s"],
    [C.yellow, "▲ PM2.5 41 µg/m³ > 35", "DEV-07730 · F3 › Zone E › R-22", "1m"], [C.yellow, "▲ Humidity 68 % > 65", "DEV-05102 · F2 › Zone D › R-09", "2m"], [C.gray, "⦸ Offline", "DEV-02288 · F4 › Zone B · no report 30 s", "45s"]];
  al.forEach(([fill, t1, t2, age], i) => {
    const ay = R1 + 44 + i * 64;
    rect(AX + 14, ay, AW - 28, 56, { fill, round: false });
    text(AX + 26, ay + 8, t1, { size: 13 }); text(AX + 26, ay + 32, t2, { size: 11, color: M }); text(AX + AW - 26, ay + 8, age, { size: 11, color: M, align: "right" });
  });
  text(AX + 14, R1 + 370, "critical first, then newest · slide in · click = drawer", { size: 11, color: C.blueInk });
  line(AX + 14, R1 + 392, AX + AW - 14, R1 + 392, { stroke: AMB });
  text(AX + 14, R1 + 400, "ACTIVITY FEED (events)\n14:05:11 RAISED   DEV-04211 co2 1650\n14:05:09 CLEARED  DEV-03310 noise\n14:05:08 OFFLINE  DEV-02288\n14:05:06 RAISED   DEV-07730 pm25 41", { size: 11, color: M });

  // Row 2: incident trend + LED matrix + radar
  const R2 = R1 + 520, w5 = 560, w3 = 330, w4 = W - 40 - w5 - w3 - 32;
  panel(X + 20, R2, w5, 250, "Fleet health · incident trend", "hover = inspect · legend = toggle");
  text(X + 36, R2 + 34, "HEALTH INDEX · % devices normal", { size: 10, color: M });
  for (let i = 0; i < 14; i++) {
    const y0 = R2 + 90 - Math.round(Math.sin(i / 2) * 10 + i * 1.5), y1 = R2 + 90 - Math.round(Math.sin((i + 1) / 2) * 10 + (i + 1) * 1.5);
    line(X + 50 + i * 34, y0, X + 84 + i * 34, y1, { stroke: AMB, sw: 3 });
  }
  text(X + w5 - 10, R2 + 64, "95.45%", { size: 12, color: AMB, align: "right" });
  line(X + 40, R2 + 110, X + w5, R2 + 110, { stroke: C.grayInk });
  text(X + 36, R2 + 114, "INCIDENTS · avg devices per 3 s", { size: 10, color: M });
  for (let i = 0; i < 30; i++) {
    const bx = X + 50 + i * 16, hC = 6 + (i % 3), hW = 34 + (i % 5) * 3, hO = 30 - (i % 4);
    rect(bx, R2 + 230 - hC, 12, hC, { fill: C.red, round: false, rough: 0, stroke: C.redInk });
    rect(bx, R2 + 230 - hC - hW, 12, hW, { fill: C.yellow, round: false, rough: 0, stroke: C.amberInk });
    rect(bx, R2 + 230 - hC - hW - hO, 12, hO, { fill: C.gray, round: false, rough: 0, stroke: C.grayInk });
  }

  const MX = X + 20 + w5 + 16;
  panel(MX, R2, w3, 250, "Device matrix · 10,000 LEDs", "1 cell = 1 device");
  rect(MX + 14, R2 + 36, w3 - 28, 150, { fill: C.green, fillStyle: "cross-hatch", round: false, stroke: C.greenInk });
  [[40, 60, C.red], [120, 90, C.yellow], [200, 50, C.yellow], [260, 130, C.red], [80, 150, C.gray], [180, 120, C.yellow]].forEach(([dx, dy, f]) => rect(MX + 14 + dx, R2 + 6 + dy, 8, 8, { fill: f, round: false, rough: 0 }));
  [74, 111, 148].forEach((dy) => line(MX + 14, R2 + dy, MX + w3 - 14, R2 + dy, { stroke: AMB }));
  rect(MX + 14, R2 + 194, 170, 24, { fill: C.green, round: false, label: "9,547", size: 12 });
  rect(MX + 188, R2 + 194, 42, 24, { fill: C.yellow, round: false, label: "222", size: 11 });
  rect(MX + 234, R2 + 194, 36, 24, { fill: C.red, round: false, label: "62", size: 11 });
  rect(MX + 274, R2 + 194, 42, 24, { fill: C.gray, round: false, label: "169", size: 11 });
  text(MX + 14, R2 + 224, "segmented bar: hover = highlight cells · click = filter", { size: 10, color: C.blueInk });

  const RX = MX + w3 + 16;
  panel(RX, R2, w4, 250, "Sensor breach radar", "click sensor = filter");
  const rcx = RX + w4 / 2, rcy = R2 + 140;
  for (let l = 1; l <= 3; l++) rect(rcx - l * 30, rcy - l * 30, l * 60, l * 60, { ellipse: true, fill: "transparent", stroke: C.grayInk, round: false });
  ["Temp", "Hum", "CO2", "O2", "NO2", "PM2.5", "PM10", "Press", "Noise", "Occ"].forEach((s, i) => {
    const a = -Math.PI / 2 + i / 10 * Math.PI * 2;
    line(rcx, rcy, rcx + 95 * Math.cos(a), rcy + 95 * Math.sin(a), { stroke: C.grayInk });
    text(rcx + 112 * Math.cos(a), rcy + 108 * Math.sin(a) - 6, s, { size: 10, color: M, align: "center" });
  });
  rect(rcx - 40, rcy - 70, 80, 110, { ellipse: true, fill: AMBF, stroke: AMB, round: false, opacity: 70 });

  // Row 3: zone heatmap + gauges
  const R3 = R2 + 270, hw2 = (W - 56) / 2;
  panel(X + 20, R3, hw2, 230, "Zone map · floor × zone", "hover = counts · click = filter");
  const heat = [[C.green, C.green, C.yellow, C.green, C.green, C.green], [C.green, C.yellow, C.red, C.green, C.green, C.yellow], [C.green, C.green, C.green, C.green, C.yellow, C.green], [C.gray, C.green, C.green, C.green, C.green, C.green]];
  heat.forEach((r, ri) => {
    text(X + 40, R3 + 58 + ri * 42, "F" + (ri + 1), { size: 12 });
    r.forEach((f, ci) => rect(X + 80 + ci * 100 + (ri % 2) * 40, R3 + 44 + ri * 42, 84, 36, { fill: f, round: false, label: "ABCDEF"[ci] + (ri + 1), size: 11 }));
  });
  panel(X + 36 + hw2, R3, hw2, 230, "Fleet averages", "online devices · threshold arcs");
  ["Avg temp 23.4 °C", "Avg CO2 672 ppm", "Avg humidity 46 %"].forEach((g, i) => {
    const gx = X + 36 + hw2 + 60 + i * 220;
    rect(gx, R3 + 50, 130, 130, { ellipse: true, fill: "transparent", stroke: AMB, round: false, sw: 3 });
    text(gx + 65, R3 + 190, g, { size: 12, align: "center" });
  });

  // Row 4: device table
  const R4 = R3 + 250;
  panel(X + 20, R4, W - 40, 430, "Devices", "live order paused while hovering · 60 of 10,000 shown (virtualized in build)");
  rect(X + 34, R4 + 40, W - 68, 26, { fill: C.gray, round: false, label: "STATUS ↓ | DEVICE | TYPE | LOCATION | WORST | TEMP °C | HUM % | CO2 | PM2.5 | NOISE dB | LAST SEEN     (click header = sort)", left: true, size: 11 });
  const rows = [[C.red, "⬣ CRITICAL  DEV-04211  EnvProbe v3    F2 › C › R-12   CO2    24.1   48   1,650   22   55   1s"],
    [C.red, "⬣ CRITICAL  DEV-00917  RackMonitor    F1 › A › R-03   Temp   36.2   41     702   14   61   2s"],
    [C.yellow, "▲ WARNING   DEV-07730  AirQuality X2  F3 › E › R-22   PM2.5  23.0   52     688   41   49   1s"],
    [C.white, "● NORMAL    DEV-01234  ClimateNode    F1 › B › R-07   —      22.8   45     640   11   50   3s"],
    [C.gray, "⦸ OFFLINE   DEV-02288  EnvProbe v3    F4 › B › R-31   —      —      —       —    —    —   45s (dimmed, dashed)"]];
  rows.forEach(([f, t], i) => rect(X + 34, R4 + 70 + i * 30, W - 68, 28, { fill: f, round: false, dashed: t.includes("OFFLINE"), label: t, left: true, size: 12 }));
  text(X + 34, R4 + 230, "breaching values coloured · changed cells flash 600 ms · stale rows (>10 s) at 60% with clock icon · row click / Enter = drawer", { size: 12, color: C.blueInk });

  // Drawer
  const DX = X + W + 80, DY = Y;
  text(DX, DY - 34, "Device drawer (right, 540 px, Esc closes, focus trapped; 3D camera flies to the LED)", { size: 16 });
  rect(DX, DY, 540, 1000, { fill: C.white, sw: 2, round: false, stroke: AMB });
  rect(DX + 16, DY + 16, 508, 92, { fill: C.red, round: false });
  text(DX + 30, DY + 26, "⬣ CRITICAL", { size: 13 });
  text(DX + 30, DY + 48, "DEV-04211   EnvProbe v3", { size: 20 });
  text(DX + 30, DY + 80, "DC-1 › Floor 2 › Zone C › Room 204 › R-12 · last seen 1s ago", { size: 12, color: M });
  text(DX + 480, DY + 26, "Esc ✕", { size: 12 });
  const tiles = [["Temp", "24.1 °C"], ["Humidity", "48 %"], ["CO2", "1,650"], ["O2", "20.9 %"], ["NO2", "31 ppb"], ["PM2.5", "22 µg"], ["PM10", "40 µg"], ["Pressure", "1013"], ["Noise", "55 dB"], ["Occupancy", "12"]];
  tiles.forEach(([l, v], i) => {
    const tx = DX + 16 + (i % 5) * 102, ty = DY + 124 + Math.floor(i / 5) * 78;
    rect(tx, ty, 96, 70, { fill: i === 2 ? C.red : C.white, round: false, stroke: i === 2 ? AMB : C.ink, sw: i === 2 ? 3 : 1 });
    text(tx + 8, ty + 6, l, { size: 11, color: M }); text(tx + 8, ty + 26, v, { size: 13 });
    line(tx + 8, ty + 60, tx + 40, ty + 52); line(tx + 40, ty + 52, tx + 86, ty + 56);
  });
  text(DX + 16, DY + 284, "click a tile = switch the time series below", { size: 11, color: C.blueInk });
  panel(DX + 16, DY + 304, 508, 300, "CO2 · ppm · last 1m", "[30s] [1m] [3m]");
  rect(DX + 40, DY + 344, 470, 50, { fill: C.red, round: false, opacity: 35, label: "critical ≥ 1,500", size: 11 });
  rect(DX + 40, DY + 394, 470, 60, { fill: C.yellow, round: false, opacity: 35, label: "warning ≥ 1,000", size: 11 });
  const p = [560, 540, 548, 520, 500, 470, 440, 420, 390, 370, 360, 365];
  p.slice(1).forEach((v, i) => line(DX + 40 + i * 42, DY + p[i], DX + 82 + i * 42, DY + v, { stroke: AMB, sw: 3 }));
  line(DX + 300, DY + 340, DX + 300, DY + 590, { stroke: M, dashed: true });
  rect(DX + 310, DY + 480, 150, 50, { fill: C.white, round: false, label: "14:05:04\nCO2 1,420 · WARNING", size: 11 });
  panel(DX + 16, DY + 620, 508, 180, "Device timeline", "events");
  text(DX + 30, DY + 652, "14:05:11  raised   co2 1650 (CRITICAL)\n14:04:40  raised   co2 1120 (WARNING)\n14:02:05  cleared  noise\n13:58:11  online\n13:57:30  offline (no report 30 s)", { size: 12 });
  panel(DX + 16, DY + 816, 508, 168, "Metadata", "GET /api/devices/DEV-04211");
  text(DX + 30, DY + 848, "deviceId  DEV-04211      type   EnvProbe v3\nsite      DC-1           floor  2\nzone      C              room   204\nrack      R-12           active true", { size: 12 });

  // Data model tab
  const TY = DY + 1060;
  text(DX, TY - 30, "Data model tab (Overview | Data model)", { size: 16 });
  rect(DX, TY, 540, 360, { fill: C.white, round: false, stroke: AMB, sw: 2 });
  [["SensorType", 30, 30, C.blue], ["Device", 200, 30, C.blue], ["Summary", 370, 30, C.violet], ["Reading", 110, 140, C.blue], ["Alert", 300, 140, C.yellow],
    ["Sample", 30, 250, C.yellow], ["Delta", 200, 250, C.violet], ["Event", 370, 250, C.blue]].forEach(([n, ex, ey, f]) => rect(DX + ex, TY + ey, 130, 60, { fill: f, round: false, label: n, size: 14 }));
  text(DX + 30, TY + 330, "blue = MongoDB · yellow = memory · violet = SSE wire · hover = relations · click = live JSON", { size: 11, color: M });

  // States
  const SY = Y + 1680;
  text(X, SY, "States (every panel)", { size: 20 });
  rect(X, SY + 34, 340, 100, { fill: C.gray, round: false, label: "Loading -> skeletons with final geometry\n(no layout shift)", size: 13 });
  rect(X + 360, SY + 34, 340, 100, { fill: C.yellow, round: false, label: "Disconnected -> amber banner\nreconnecting in 4s · last update 12s · Retry\ndata dimmed, never blanked", size: 13 });
  rect(X + 720, SY + 34, 340, 100, { fill: C.white, dashed: true, round: false, label: "Stale (>10 s) -> 60% + age\nOffline (>30 s) -> grey, dashed", size: 13 });
  rect(X + 1080, SY + 34, 360, 100, { fill: C.white, round: false, label: "Empty -> No devices match + Clear filters\nError -> message + reqId + Retry\n3D fallback if WebGL or CDN fails", size: 13 });
  save("03-wireframe.excalidraw");
}
console.log("ok");
