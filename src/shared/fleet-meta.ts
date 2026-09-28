import { DEVICE_TYPES, FLOORS, ZONES, deviceIdFor, deviceNameFor, type FleetMeta } from "./fleet";
import type { DeviceMeta } from "./types";

export function encodeFleetMeta(devices: readonly DeviceMeta[], site: string): FleetMeta {
  return { site, rows: devices.map((d) => [d.floor, ZONES.indexOf(d.zone), DEVICE_TYPES.indexOf(d.type), d.room, d.rack]) };
}

export function decodeFleetMeta(meta: FleetMeta): DeviceMeta[] {
  return meta.rows.map(([floor, zoneIdx, typeIdx, room, rack], idx) => {
    const f = FLOORS.find((x) => x === floor) ?? 1;
    const zone = ZONES[zoneIdx] ?? "A";
    const type = DEVICE_TYPES[typeIdx] ?? "EnvProbe v3";
    return { idx, deviceId: deviceIdFor(idx), name: deviceNameFor(idx, zone, f, type), type, site: meta.site, floor: f, zone, room, rack, active: true };
  });
}
