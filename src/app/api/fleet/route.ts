import { SITE } from "@/shared/fleet";
import { encodeFleetMeta } from "@/shared/fleet-meta";
import { handleRoute } from "@/server/errors";
import { getRuntime } from "@/server/sim/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Columnar metadata for all 10,000 devices; the browser decodes it once into DeviceMeta objects. */
export const GET = handleRoute(() => encodeFleetMeta(getRuntime().engine.state.devices, SITE));
