import type { AnyBulkWriteOperation } from "mongodb";
import type { DeviceMeta } from "@/shared/types";
import { collections, type DeviceDoc } from "../db/collections";

const toDoc = ({ deviceId, ...rest }: DeviceMeta): DeviceDoc => ({ _id: deviceId, ...rest });
const fromDoc = ({ _id, ...rest }: DeviceDoc): DeviceMeta => ({ deviceId: _id, ...rest });

export const devicesRepo = {
  /** Idempotent: replaces by deviceId, so running it twice leaves 10,000 devices, not 20,000. */
  async upsertAll(devices: readonly DeviceMeta[]): Promise<number> {
    const col = await collections.devices();
    const ops: AnyBulkWriteOperation<DeviceDoc>[] = devices.map((d) => ({ replaceOne: { filter: { _id: d.deviceId }, replacement: toDoc(d), upsert: true } }));
    const res = await col.bulkWrite(ops, { ordered: false });
    return res.upsertedCount + res.matchedCount;
  },

  async findById(deviceId: string): Promise<DeviceMeta | null> {
    const doc = await (await collections.devices()).findOne({ _id: deviceId });
    return doc ? fromDoc(doc) : null;
  },

  async count(): Promise<number> {
    return (await collections.devices()).countDocuments();
  },
};
