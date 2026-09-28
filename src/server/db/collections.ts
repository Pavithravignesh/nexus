import type { Collection } from "mongodb";
import type { SensorKey } from "@/shared/sensors";
import type { StatusName } from "@/shared/status";
import type { DeviceMeta, EventKind } from "@/shared/types";
import { getDb } from "./client";

// Document shapes as stored. Only repos see these; everything above works with domain types.

export type DeviceDoc = Omit<DeviceMeta, "deviceId"> & { _id: string };

export type ReadingDoc = {
  _id: string; // `${deviceId}:${sensor}`
  deviceId: string;
  sensor: SensorKey;
  value: number;
  unit: string;
  status: StatusName;
  ts: Date;
  location: string; // zone key, e.g. "C2"
};

export type EventDoc = {
  _id: string;
  deviceId: string;
  deviceIdx: number;
  kind: EventKind;
  severity: StatusName;
  sensor: SensorKey | null;
  value: number | null;
  ts: Date;
};

export const collections = {
  devices: async (): Promise<Collection<DeviceDoc>> => (await getDb()).collection<DeviceDoc>("devices"),
  readings: async (): Promise<Collection<ReadingDoc>> => (await getDb()).collection<ReadingDoc>("latest_readings"),
  events: async (): Promise<Collection<EventDoc>> => (await getDb()).collection<EventDoc>("events"),
};
