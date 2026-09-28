import type { DeviceType, Floor, Zone, ZoneKey } from "./fleet";
import type { SensorKey } from "./sensors";
import type { StatusName, ZoneCounts } from "./status";

/** Static metadata of one device. `idx` is its stable position in every typed array. */
export type DeviceMeta = {
  idx: number;
  deviceId: string;
  name: string;
  type: DeviceType;
  site: string;
  floor: Floor;
  zone: Zone;
  room: string;
  rack: string;
  active: boolean;
};

/**
 * The live fleet as parallel typed arrays, shared by the simulator and the browser store.
 * Readings are laid out `idx * SENSOR_COUNT + sensorIdx`.
 */
export type FleetState = {
  devices: readonly DeviceMeta[];
  status: Uint8Array;
  readingStatus: Uint8Array;
  values: Float32Array;
  lastSeen: Float64Array;
};

export type Summary = {
  ts: string;
  seq: number;
  total: number;
  /** Devices that reported in the tick this summary belongs to. */
  reporting: number;
  byStatus: Record<StatusName, number>;
  bySensor: Record<SensorKey, { warning: number; critical: number }>;
  byZone: Record<ZoneKey, ZoneCounts>;
  /** Fleet averages over online devices only. */
  averages: { temperature: number; humidity: number; co2: number };
};

/** [deviceIdx, status, lastSeenMs, v0 … v9]; values rounded to sensor precision, null if unknown. */
export type DeltaRow = [number, number, number, ...(number | null)[]];

export type DeltaFrame = { seq: number; ts: string; rows: DeltaRow[] };

export type AlertSeverity = "WARNING" | "CRITICAL" | "OFFLINE";

export type Alert = {
  id: string;
  deviceIdx: number;
  deviceId: string;
  /** null for OFFLINE alerts, which are about the device, not a reading. */
  sensor: SensorKey | null;
  severity: AlertSeverity;
  value: number | null;
  raisedAt: string;
};

export type AlertFrame = { seq: number; raised: Alert[]; cleared: string[] };

export type EventKind = "raised" | "cleared" | "offline" | "online";

export type TelemetryEvent = {
  id: string;
  deviceIdx: number;
  deviceId: string;
  kind: EventKind;
  severity: StatusName;
  sensor: SensorKey | null;
  value: number | null;
  ts: string;
};

export type HelloFrame = { serverTime: string; seq: number; tickMs: number };
