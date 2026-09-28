// Fleet shape shared by the simulator, the API and the browser.

export const FLEET_SIZE = 10_000;
export const SITE = "DC-1";
export const FLOORS = [1, 2, 3, 4] as const;
export const ZONES = ["A", "B", "C", "D", "E", "F"] as const;
export const DEVICE_TYPES = ["EnvProbe v3", "AirQuality X2", "RackMonitor", "ClimateNode"] as const;

export type Floor = (typeof FLOORS)[number];
export type Zone = (typeof ZONES)[number];
export type DeviceType = (typeof DEVICE_TYPES)[number];
/** Zone letter + floor number, e.g. "C2". The unit of the heatmap and the 3D rack rows. */
export type ZoneKey = `${Zone}${Floor}`;

export function zoneKey(zone: Zone, floor: Floor): ZoneKey {
  return `${zone}${floor}`;
}

export const ZONE_KEYS: readonly ZoneKey[] = FLOORS.flatMap((f) => ZONES.map((z) => zoneKey(z, f)));

export function deviceIdFor(idx: number): string {
  return "DEV-" + String(idx + 1).padStart(5, "0");
}

/** Inverse of deviceIdFor; returns null for anything that is not a valid id in the fleet. */
export function deviceIdxFor(deviceId: string): number | null {
  const m = /^DEV-(\d{5})$/.exec(deviceId);
  if (!m?.[1]) return null;
  const idx = Number(m[1]) - 1;
  return idx >= 0 && idx < FLEET_SIZE ? idx : null;
}
