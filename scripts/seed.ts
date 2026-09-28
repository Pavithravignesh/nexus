// Seed MongoDB with the 10,000 devices and their 100,000 latest readings. Idempotent: it
// upserts by id, so running it twice leaves the same data. Uses the same seed as the
// simulator, so DEV-04211 is in the same rack in the database and on screen.
import "dotenv/config";
import { closeDb } from "../src/server/db/client";
import { ensureIndexes } from "../src/server/db/indexes";
import { env } from "../src/server/env";
import { devicesRepo } from "../src/server/repos/devices.repo";
import { eventsRepo } from "../src/server/repos/events.repo";
import { readingsRepo } from "../src/server/repos/readings.repo";
import { SimEngine } from "../src/server/sim/engine";

async function main(): Promise<void> {
  const started = Date.now();
  const engine = new SimEngine({ seed: env.SIM_SEED, nowMs: started, changeRatio: env.CHANGE_RATIO, offlineAfterMs: env.OFFLINE_AFTER_MS });
  await ensureIndexes();
  await devicesRepo.upsertAll(engine.state.devices);
  await readingsRepo.upsertLatest(engine.state, engine.state.devices.map((d) => d.idx));
  const [devices, readings, events] = await Promise.all([devicesRepo.count(), readingsRepo.count(), eventsRepo.count()]);
  console.log(`seeded ${env.MONGODB_DB}: ${devices} devices, ${readings} latest readings, ${events} events (${Date.now() - started} ms)`);
}

main()
  .catch((err: unknown) => {
    console.error("seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void closeDb());
