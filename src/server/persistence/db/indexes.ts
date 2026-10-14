import { collections } from "./collections";

export const EVENT_TTL_SECONDS = 24 * 60 * 60;

export async function ensureIndexes(): Promise<void> {
  const [devices, readings, events] = await Promise.all([collections.devices(), collections.readings(), collections.events()]);
  await Promise.all([
    devices.createIndex({ floor: 1, zone: 1 }, { name: "location" }),
    readings.createIndex({ deviceId: 1 }, { name: "device" }),
    readings.createIndex({ status: 1, sensor: 1 }, { name: "status_sensor" }),
    events.createIndex({ ts: 1 }, { name: "ttl", expireAfterSeconds: EVENT_TTL_SECONDS }),
    events.createIndex({ deviceId: 1, ts: -1 }, { name: "device_time" }),
  ]);
}
