import { ensureIndexes } from "../db/indexes";
import { logger } from "../logger";
import { devicesRepo } from "../repos/devices.repo";
import { eventsRepo } from "../repos/events.repo";
import { readingsRepo } from "../repos/readings.repo";
import type { Runtime } from "../sim/runtime";

const RETRY_MS = 15_000;
const log = logger.child({ mod: "persistence" });

export type PersistenceStatus = {
  attached: boolean;
  lastError: string | null;
  lastFlush: { at: string; readings: number; events: number; ms: number } | null;
};

// On globalThis: Next bundles instrumentation.ts and route handlers separately, so a plain
// module-level object would not be the one /api/health reads.
const g = globalThis as typeof globalThis & { __nexusPersistence?: PersistenceStatus };
export const persistenceStatus: PersistenceStatus = (g.__nexusPersistence ??= { attached: false, lastError: null, lastFlush: null });

/**
 * Connect the simulator to MongoDB: indexes, the 10,000 devices, a full snapshot of the
 * 100,000 latest readings, then batched flushes of whatever changed. If MongoDB is down the
 * dashboard keeps running from memory and this retries in the background.
 */
export async function attachPersistence(rt: Runtime): Promise<void> {
  try {
    const started = performance.now();
    await ensureIndexes();
    const devices = await devicesRepo.upsertAll(rt.engine.state.devices);
    const readings = await readingsRepo.upsertLatest(rt.engine.state, rt.engine.state.devices.map((d) => d.idx));
    rt.onFlush = flush;
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
