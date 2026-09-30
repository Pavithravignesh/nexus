import { thresholdsSchema, type Thresholds } from "@/shared/thresholds";
import { fetchJson } from "./api";

const ENDPOINT = "/api/thresholds";

export function fetchThresholds(): Promise<Thresholds> {
  return fetchJson(ENDPOINT, thresholdsSchema);
}

/** Replace the server's alarm rules; resolves with the set the server now uses. */
export function saveThresholds(t: Thresholds): Promise<Thresholds> {
  return fetchJson(ENDPOINT, thresholdsSchema, { method: "PUT", body: JSON.stringify(t), headers: { "content-type": "application/json" } });
}

export function resetThresholds(): Promise<Thresholds> {
  return fetchJson(ENDPOINT, thresholdsSchema, { method: "DELETE" });
}
