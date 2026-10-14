import { thresholdsSchema, type Thresholds } from "@/shared/thresholds";
import { collections, type SettingDoc } from "../db/collections";

const THRESHOLDS_ID = "thresholds";

/** A stored threshold set, or null when absent or no longer valid (e.g. the sensor catalogue changed). */
export function thresholdsFromDoc(doc: SettingDoc | null): Thresholds | null {
  if (!doc) return null;
  const parsed = thresholdsSchema.safeParse(doc.value);
  return parsed.success ? parsed.data : null;
}

export const settingsRepo = {
  async loadThresholds(): Promise<Thresholds | null> {
    return thresholdsFromDoc(await (await collections.settings()).findOne({ _id: THRESHOLDS_ID }));
  },

  async saveThresholds(t: Thresholds): Promise<void> {
    await (await collections.settings()).updateOne({ _id: THRESHOLDS_ID }, { $set: { value: t, updatedAt: new Date() } }, { upsert: true });
  },
};
