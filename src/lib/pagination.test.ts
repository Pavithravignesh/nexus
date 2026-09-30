import { describe, expect, it } from "vitest";
import { paginate } from "./pagination";

const list = Array.from({ length: 23 }, (_, i) => i);

describe("paginate", () => {
  it("returns the requested page with 1-based bounds", () => {
    expect(paginate(list, 1, 10)).toMatchObject({ items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], page: 1, pages: 3, from: 11, to: 20, total: 23 });
  });

  it("returns a short last page", () => {
    expect(paginate(list, 2, 10)).toMatchObject({ items: [20, 21, 22], from: 21, to: 23 });
  });

  it("clamps pages out of range (e.g. after a filter shrinks the list)", () => {
    expect(paginate(list, 9, 10).page).toBe(2);
    expect(paginate(list, -3, 10).page).toBe(0);
  });

  it("handles an empty list as one empty page", () => {
    expect(paginate([], 0, 25)).toEqual({ items: [], page: 0, pages: 1, from: 0, to: 0, total: 0 });
  });

  it("treats a non-positive page size as 1", () => {
    expect(paginate(list, 0, 0).items).toEqual([0]);
  });
});
