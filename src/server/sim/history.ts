import { SENSOR_COUNT } from "@/shared/sensors";

/**
 * Fixed-size ring of Samples for every (device, sensor): one snapshot of all values per
 * sample interval. 180 samples x 100,000 series x 4 bytes ≈ 72 MB. At 100k+ devices this
 * moves to a MongoDB time-series collection (see docs/HLD.md).
 */
export class HistoryRing {
  readonly capacity: number;
  private readonly data: Float32Array;
  private readonly times: Float64Array;
  private head = 0;
  private size = 0;

  constructor(
    private readonly devices: number,
    capacity: number,
  ) {
    this.capacity = capacity;
    this.data = new Float32Array(devices * SENSOR_COUNT * capacity);
    this.times = new Float64Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  push(values: Float32Array, nowMs: number): void {
    this.data.set(values, this.head * this.devices * SENSOR_COUNT);
    this.times[this.head] = nowMs;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  /** Oldest-first samples for one device and sensor, optionally only those at or after `sinceMs`. */
  series(idx: number, sensorIdx: number, sinceMs = 0): { ts: number; value: number }[] {
    const out: { ts: number; value: number }[] = [];
    const slot = this.devices * SENSOR_COUNT;
    for (let k = 0; k < this.size; k++) {
      const pos = (this.head - this.size + k + this.capacity) % this.capacity;
      const ts = this.times[pos] ?? 0;
      if (ts < sinceMs) continue;
      out.push({ ts, value: this.data[pos * slot + idx * SENSOR_COUNT + sensorIdx] ?? 0 });
    }
    return out;
  }
}
