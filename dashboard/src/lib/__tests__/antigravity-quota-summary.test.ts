import { describe, expect, it } from "vitest";

import { parseAntigravityQuotaSummary } from "../antigravity-quota-summary";

describe("parseAntigravityQuotaSummary", () => {
  it("keeps weekly and five-hour buckets separate", () => {
    const groups = parseAntigravityQuotaSummary({
      groups: [
        {
          displayName: "Gemini Models",
          buckets: [
            {
              bucketId: "gemini-weekly",
              displayName: "Weekly Limit Remaining",
              window: "weekly",
              remainingFraction: 0.32,
              resetTime: "2026-08-23T07:06:02Z",
            },
            {
              bucketId: "gemini-5h",
              displayName: "Five Hour Limit Remaining",
              window: "5h",
              remainingFraction: 1,
              resetTime: "2026-08-22T12:21:55Z",
            },
          ],
        },
      ],
    });

    expect(groups).toHaveLength(2);
    expect(groups?.[0]).toMatchObject({
      id: "gemini-weekly",
      windowType: "weekly",
      remainingFraction: 0.32,
    });
    expect(groups?.[1]).toMatchObject({
      id: "gemini-5h",
      windowType: "five-hour",
      remainingFraction: 1,
    });
  });

  it("accepts snake_case payloads and ignores buckets without a fraction", () => {
    const groups = parseAntigravityQuotaSummary({
      groups: [
        {
          display_name: "Claude and GPT models",
          buckets: [
            {
              bucket_id: "3p-weekly",
              display_name: "Weekly Limit Remaining",
              window: "weekly",
              remaining_fraction: "0.29",
              reset_time: "2026-08-28T02:22:04Z",
            },
            { bucket_id: "missing", window: "5h" },
          ],
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups?.[0]).toMatchObject({
      id: "3p-weekly",
      label: "Claude and GPT models - Weekly Limit Remaining",
      remainingFraction: 0.29,
      windowType: "weekly",
    });
  });
});
