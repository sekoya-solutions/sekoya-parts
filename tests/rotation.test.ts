// The sale rotation's pure parts and the generated availability (issue #151).
import { describe, expect, it } from "vitest";
import { availabilityOf, productRows } from "../catalog/generator.ts";
import { paced, rotationTags } from "../cms/sales/rotation.ts";

describe("rotationTags", () => {
  it("refresh each new sale's price, then each category's price order once", () => {
    expect(
      rotationTags([
        { id: 7, categoryId: 2 },
        { id: 9, categoryId: 2 },
        { id: 4, categoryId: 5 },
      ]),
    ).toEqual([
      "product:7:price",
      "product:9:price",
      "product:4:price",
      "category:2:prices",
      "category:5:prices",
    ]);
  });
});

describe("paced", () => {
  it("refreshes every tag in order, waiting 100 ms between calls at 10 a second", async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    const count = await paced(
      ["a", "b", "c"],
      (tag) => calls.push(tag),
      10,
      async (ms) => {
        waits.push(ms);
        calls.push(`wait ${ms}`);
      },
    );
    expect(count).toBe(3);
    expect(calls).toEqual(["a", "wait 100", "b", "wait 100", "c"]);
    expect(waits).toHaveLength(2);
  });

  it("does nothing for no tag", async () => {
    expect(
      await paced([], () => {
        throw new Error("no call expected");
      }),
    ).toBe(0);
  });
});

describe("availability", () => {
  it("follows the owner's split, the showcase always in stock", () => {
    expect(availabilityOf(0.5, false)).toBe("in-stock");
    expect(availabilityOf(0.9, false)).toBe("on-order");
    expect(availabilityOf(0.97, false)).toBe("out-of-stock");
    expect(availabilityOf(0.97, true)).toBe("in-stock");
  });

  it("puts about 85%, 10% and 5% of the full catalog in stock, on order and out of stock", () => {
    const counts = { "in-stock": 0, "on-order": 0, "out-of-stock": 0 };
    let total = 0;
    for (const row of productRows(1, "full")) {
      counts[row[6]]++;
      total++;
    }
    expect(counts["in-stock"] / total).toBeCloseTo(0.85, 1);
    expect(counts["on-order"] / total).toBeCloseTo(0.1, 1);
    expect(counts["out-of-stock"] / total).toBeCloseTo(0.05, 1);
  });
});
