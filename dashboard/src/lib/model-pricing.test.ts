import { describe, expect, it } from "vitest";
import {
  calculateCostFromBuckets,
  resolveModelPrice,
  type PricingBucket,
} from "./model-pricing";

function bucket(overrides: Partial<PricingBucket> = {}): PricingBucket {
  return {
    requests: 1,
    inputTokens: 1_000_000,
    uncachedInputTokens: 100_000,
    cacheReadTokens: 800_000,
    cacheWriteTokens: 100_000,
    outputTokens: 10_000,
    longContext: false,
    serviceTier: "standard",
    ...overrides,
  };
}

describe("model pricing", () => {
  it("uses the current GPT-5.6 Sol promotional rates", () => {
    const price = resolveModelPrice("gpt-5.6-sol");
    expect(price).toMatchObject({
      inputPer1M: 4,
      cachedInputPer1M: 0.4,
      cacheWritePer1M: 5,
      outputPer1M: 20,
      longContextThreshold: 272_000,
      longContextRates: {
        inputPer1M: 8,
        cachedInputPer1M: 0.8,
        cacheWritePer1M: 10,
        outputPer1M: 30,
      },
    });
  });

  it("prices GPT-5.6 Sol cache reads and writes separately", () => {
    const price = resolveModelPrice("gpt-5.6-sol");
    expect(price).not.toBeNull();
    expect(calculateCostFromBuckets([bucket()], price!)).toBeCloseTo(1.42, 8);
  });

  it("uses the full-request long-context rates", () => {
    const price = resolveModelPrice("gpt-5.6-sol");
    expect(calculateCostFromBuckets([bucket({ longContext: true })], price!)).toBeCloseTo(2.74, 8);
  });

  it("uses Fast mode rates from priority service-tier responses", () => {
    const price = resolveModelPrice("gpt-5.6-sol");
    expect(calculateCostFromBuckets([bucket({ serviceTier: "priority" })], price!)).toBeCloseTo(2.84, 8);
  });

  it("resolves CPA Claude aliases and keeps Spark explicitly unpriced", () => {
    expect(resolveModelPrice("claude-opus-4-6-thinking")?.cachedInputPer1M).toBe(0.5);
    expect(resolveModelPrice("gpt-5.3-codex-spark")?.pricingUnavailable).toBe(true);
  });

  it("uses Grok 4.6 long-context pricing", () => {
    const price = resolveModelPrice("grok-4.6");
    expect(calculateCostFromBuckets([bucket({ longContext: true, cacheWriteTokens: 0 })], price!)).toBeCloseTo(1.32, 8);
  });
});
