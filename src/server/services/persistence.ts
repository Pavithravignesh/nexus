import { DEFAULT_THRESHOLDS } from "@/shared/thresholds";
import { ensureIndexes } from "../db/indexes";
import { env } from "../env";
import { logger } from "../logger";
import { devicesRepo } from "../repos/devices.repo";
import { eventsRepo } from "../repos/events.repo";
import { readingsRepo } from "../repos/readings.repo";
import { settingsRepo } from "../repos/settings.repo";
import type { Runtime } from "../sim/runtime";
import { applyThresholds, currentThresholds } from "./thresholds.service";

const RETRY_MS = 15_000;
const log = logger.child({ mod: "persistence" });

export type PersistenceStatus = {
  enabled: boolean;
  attached: boolean;
  lastError: string | null;
  lastFlush: { at: string; readings: number; events: number; ms: number } | null;
};

// On globalThis: Next bundles instrumentation.ts and route handlers separately, so a plain
// module-level object would not be the one /api/health reads.
const g = globalThis as typeof globalThis & { __nexusPersistence?: PersistenceStatus };
export const persistenceStatus: PersistenceStatus = (g.__nexusPersistence ??= { enabled: Boolean(env.MONGODB_URI), attached: false, lastError: null, lastFlush: null });

/**
 * Connect the simulator to MongoDB: indexes, the 10,000 devices, a full snapshot of the
 * 100,000 latest readings, then batched flushes of whatever changed. If MongoDB is down the
 * dashboard keeps running from memory and this retries in the background.
 */
export async function attachPersistence(rt: Runtime): Promise<void> {
  if (!env.MONGODB_URI) {
    log.info("MONGODB_URI not set; persistence disabled, running from memory");
    return;
  }
  try {
    const started = performance.now();
    await ensureIndexes();
    const devices = await devicesRepo.upsertAll(rt.engine.state.devices);
    const readings = await readingsRepo.upsertLatest(rt.engine.state, rt.engine.state.devices.map((d) => d.idx));
    await restoreThresholds(rt);
    rt.onFlush = flush;
    rt.onThresholds = saveThresholds;
    persistenceStatus.attached = true;
    persistenceStatus.lastError = null;
    log.info({ devices, readings, ms: Math.round(performance.now() - started) }, "persistence attached");
  } catch (err) {
    persistenceStatus.attached = false;
    persistenceStatus.lastError = err instanceof Error ? err.message : String(err);
    log.warn({ err: persistenceStatus.lastError, retryInMs: RETRY_MS }, "MongoDB unavailable; running from memory");
    setTimeout(() => void attachPersistence(rt), RETRY_MS).unref();
  }
}

/** Stored alarm rules win at boot, unless an operator edited them while MongoDB was unreachable. */
async function restoreThresholds(rt: Runtime): Promise<void> {
  const live = currentThresholds();
  if (live !== DEFAULT_THRESHOLDS) return settingsRepo.saveThresholds(live);
  const stored = await settingsRepo.loadThresholds();
  if (stored) applyThresholds(rt, stored);
}

const saveThresholds: NonNullable<Runtime["onThresholds"]> = async (t) => {
  try {
    await settingsRepo.saveThresholds(t);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "thresholds are live but could not be saved");
  }
};

const flush: NonNullable<Runtime["onFlush"]> = async (batch, engine) => {
  const started = performance.now();
  try {
    const [readings, events] = await Promise.all([readingsRepo.upsertLatest(engine.state, batch.idxs), eventsRepo.insertMany(batch.events)]);
    const ms = Math.round(performance.now() - started);
    persistenceStatus.lastFlush = { at: new Date().toISOString(), readings, events, ms };
    log.debug(persistenceStatus.lastFlush, "flushed");
  } catch (err) {
    persistenceStatus.lastError = err instanceof Error ? err.message : String(err);
    throw new Error("flush failed", { cause: err });
  }
};
