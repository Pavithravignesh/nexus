import type { Thresholds } from "@/shared/thresholds";
import { env } from "../env";
import { logger } from "../logger";
import { StreamHub } from "../services/stream-hub";
import { SimEngine } from "./engine";

export type Runtime = {
  engine: SimEngine;
  hub: StreamHub;
  startedAt: number;
  /** Set by the persistence layer; called every FLUSH_INTERVAL_MS with what changed. */
  onFlush: ((batch: ReturnType<SimEngine["takeDirty"]>, engine: SimEngine) => Promise<void>) | null;
  /** Set by the persistence layer; saves the alarm rules after an operator edit. Must not reject. */
  onThresholds: ((t: Thresholds) => Promise<void>) | null;
  stop(): void;
};

// Cached on globalThis: Next.js dev re-evaluates modules on every edit, and a second
// simulator would mean two fleets ticking at once.
const g = globalThis as typeof globalThis & { __nexusRuntime?: Runtime };

export function getRuntime(): Runtime {
  g.__nexusRuntime ??= startRuntime();
  return g.__nexusRuntime;
}

function startRuntime(): Runtime {
  const log = logger.child({ mod: "sim" });
  const engine = new SimEngine({ seed: env.SIM_SEED, nowMs: Date.now(), changeRatio: env.CHANGE_RATIO, offlineAfterMs: env.OFFLINE_AFTER_MS });
  const hub = new StreamHub(env.TICK_MS, { staleAfterMs: env.STALE_AFTER_MS, offlineAfterMs: env.OFFLINE_AFTER_MS });

  const tick = setInterval(() => {
    try {
      const started = performance.now();
      const result = engine.step(Date.now());
      hub.publish(result);
      const ms = performance.now() - started;
      if (ms > env.TICK_MS * 0.5) log.warn({ ms: Math.round(ms), seq: result.seq }, "slow tick");
    } catch (err) {
      log.error({ err }, "tick failed");
    }
  }, env.TICK_MS);

  let flushing = false;
  const flush = setInterval(() => {
    if (flushing) return;
    // Without a database, drop the batch so pending events cannot grow without bound.
    // Persistence does a full upsert of the fleet when it (re)attaches.
    if (!runtime.onFlush) {
      engine.takeDirty();
      return;
    }
    flushing = true;
    runtime
      .onFlush(engine.takeDirty(), engine)
      .catch((err: unknown) => log.error({ err }, "flush failed"))
      .finally(() => {
        flushing = false;
      });
  }, env.FLUSH_INTERVAL_MS);

  const runtime: Runtime = {
    engine,
    hub,
    startedAt: Date.now(),
    onFlush: null,
    onThresholds: null,
    stop() {
      clearInterval(tick);
      clearInterval(flush);
      delete g.__nexusRuntime;
    },
  };
  log.info({ devices: engine.state.devices.length, tickMs: env.TICK_MS, changeRatio: env.CHANGE_RATIO }, "simulator started");
  return runtime;
}
