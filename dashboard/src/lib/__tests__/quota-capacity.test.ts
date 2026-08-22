import { describe, expect, it } from "vitest";

import { averageQuotaCapacity } from "../quota-capacity";

describe("averageQuotaCapacity", () => {
  it("uses an equal-weight average across account quota fractions", () => {
    expect(averageQuotaCapacity([0.13422152, 0.12980874, 0.44151714, 0.80938226])).toBeCloseTo(
      0.378732415
    );
  });

  it("clamps provider values and rejects an empty sample", () => {
    expect(averageQuotaCapacity([-1, 2])).toBe(0.5);
    expect(averageQuotaCapacity([])).toBeNull();
  });
});
