// The sensor catalogue: the single source of units, precision and thresholds.

export const SENSOR_KEYS = [
  "temperature",
  "humidity",
  "co2",
  "o2",
  "no2",
  "pm25",
  "pm10",
  "pressure",
  "noise",
  "occupancy",
] as const;

export type SensorKey = (typeof SENSOR_KEYS)[number];
export const SENSOR_COUNT = SENSOR_KEYS.length;

/** [warning, critical] bound. `hi` breaches at or above, `lo` at or below. */
export type Bound = readonly [warning: number, critical: number];

export type SensorType = {
  key: SensorKey;
  label: string;
  unit: string;
  decimals: number;
  /** Typical healthy value; the simulator centres baselines on it. */
  nominal: number;
  /** Per-step noise the simulator applies. */
  jitter: number;
  hi?: Bound;
  lo?: Bound;
};

export const SENSORS = [
  { key: "temperature", label: "Temp", unit: "°C", decimals: 1, nominal: 23, jitter: 0.25, hi: [30, 35] },
  { key: "humidity", label: "Humidity", unit: "%", decimals: 0, nominal: 46, jitter: 0.6, hi: [65, 80] },
  { key: "co2", label: "CO2", unit: "ppm", decimals: 0, nominal: 650, jitter: 12, hi: [1000, 1500] },
  { key: "o2", label: "O2", unit: "%", decimals: 1, nominal: 20.9, jitter: 0.03, lo: [19.5, 18.5] },
  { key: "no2", label: "NO2", unit: "ppb", decimals: 0, nominal: 28, jitter: 1.5, hi: [100, 200] },
  { key: "pm25", label: "PM2.5", unit: "µg/m³", decimals: 0, nominal: 12, jitter: 0.8, hi: [35, 55] },
  { key: "pm10", label: "PM10", unit: "µg/m³", decimals: 0, nominal: 24, jitter: 1.2, hi: [50, 150] },
  { key: "pressure", label: "Pressure", unit: "hPa", decimals: 0, nominal: 1013, jitter: 0.6, lo: [985, 970], hi: [1040, 1055] },
  { key: "noise", label: "Noise", unit: "dB", decimals: 0, nominal: 52, jitter: 1.2, hi: [80, 90] },
  { key: "occupancy", label: "Occupancy", unit: "ppl", decimals: 0, nominal: 8, jitter: 0.8, hi: [40, 60] },
] as const satisfies readonly SensorType[];

export function sensorIndex(key: SensorKey): number {
  return SENSOR_KEYS.indexOf(key);
}

export function sensorAt(idx: number): SensorType {
  const s = SENSORS[idx];
  if (!s) throw new RangeError(`no sensor at index ${idx}`);
  return s;
}

/** Round a value to the sensor's display precision (what goes on the wire and on screen). */
export function roundFor(idx: number, value: number): number {
  const f = 10 ** sensorAt(idx).decimals;
  return Math.round(value * f) / f;
}
