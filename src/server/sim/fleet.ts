import { DEVICE_TYPES, FLEET_SIZE, FLOORS, SITE, ZONES, deviceIdFor } from "@/shared/fleet";
import type { DeviceMeta } from "@/shared/types";
import type { Rng } from "./random";

/**
 * Build the 10,000 device definitions. Deterministic for a given rng seed, so the seed script,
 * the running simulator and tests all agree on where DEV-04211 lives.
 */
export function buildFleet(rng: Rng, size: number = FLEET_SIZE): DeviceMeta[] {
  return Array.from({ length: size }, (_, idx) => {
    const floor = FLOORS[rng.int(FLOORS.length)] ?? 1;
    const zone = ZONES[rng.int(ZONES.length)] ?? "A";
    const type = DEVICE_TYPES[idx % DEVICE_TYPES.length] ?? "EnvProbe v3";
    return {
      idx,
      deviceId: deviceIdFor(idx),
      name: `${zone}${floor}-${type.split(" ")[0]}-${(idx % 97) + 1}`,
      type,
      site: SITE,
      floor,
      zone,
      room: `${floor}0${1 + rng.int(8)}`,
      rack: `R-${String(1 + rng.int(40)).padStart(2, "0")}`,
      active: true,
    };
  });
}
