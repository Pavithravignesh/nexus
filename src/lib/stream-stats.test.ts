import { describe, expect, it } from "vitest";
import { StreamStats } from "./stream-stats";

function clock(start: number): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe("StreamStats", () => {
  it("measures frame, tick and byte rates over the last 10 s", () => {
    const c = clock(0);
    const s = new StreamStats(c.now);
    for (let k = 0; k < 10; k++) {
      c.advance(1000);
      s.record(2048, { serverTs: new Date(c.now()).toISOString() }); // summary
      s.record(1024); // delta
    }
    const snap = s.snapshot();
    expect(snap.ticksPerSec).toBeCloseTo(10 / 9, 1);
    expect(snap.framesPerSec).toBeCloseTo(20 / 9, 1);
    expect(snap.kbPerSec).toBeCloseTo(30 / 9, 1);
    expect(snap.totalFrames).toBe(20);
  });

  it("forgets frames older than the window", () => {
    const c = clock(0);
    const s = new StreamStats(c.now);
    s.record(1000);
    c.advance(20_000);
    expect(s.snapshot().framesPerSec).toBe(0);
    expect(s.snapshot().totalBytes).toBe(1000);
  });

  it("corrects latency for server/client clock skew learned from hello", () => {
    const c = clock(1_000_000);
    const s = new StreamStats(c.now);
    s.syncClock(new Date(1_000_000 + 5000).toISOString()); // server clock runs 5 s ahead
    c.advance(40);
    s.record(10, { serverTs: new Date(1_000_000 + 5000).toISOString() }); // sent at hello time
    expect(s.snapshot().latencyMs).toBe(40);
  });

  it("counts reconnects after the first open and tracks the newest event id and client count", () => {
    const s = new StreamStats(() => 5);
    s.markOpened();
    s.markOpened();
    s.markOpened();
    s.record(1, { eventId: 7, clients: 3 });
    s.record(1, { eventId: 6 });
    expect(s.snapshot()).toMatchObject({ reconnects: 2, connectedAt: 5, lastEventId: 7, clients: 3 });
  });
});
