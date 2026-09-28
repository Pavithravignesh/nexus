// Seeded randomness so the fleet layout is reproducible and simulator tests are deterministic.

export type Rng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [a, b). */
  range(a: number, b: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Approximately normal, mean 0, sd ~0.8 (sum of three uniforms). Cheap and bounded. */
  gauss(): number;
};

export function createRng(seed: number): Rng {
  // mulberry32
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (n) => Math.floor(next() * n),
    gauss: () => (next() + next() + next() - 1.5) * 1.6,
  };
}
