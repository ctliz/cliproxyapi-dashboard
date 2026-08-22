import { describe, expect, it } from "vitest";
import { normalizeTokenAccounting } from "./token-accounting";

describe("normalizeTokenAccounting", () => {
  it("uses a valid CPA v2 independent-cache breakdown", () => {
    expect(normalizeTokenAccounting({
      accounting_version: 2,
      tokens: {
        input_tokens: 10,
        output_tokens: 7,
        reasoning_tokens: 2,
        cached_tokens: 80,
        total_tokens: 102,
      },
      token_breakdown: {
        schema_version: 2,
        quality: "complete",
        total_tokens: 102,
        input: {
          total_tokens: 95,
          uncached_tokens: 10,
          cache_read_tokens: 80,
          cache_write_tokens: 5,
        },
        output: {
          total_tokens: 7,
          non_reasoning_tokens: 5,
          reasoning_tokens: 2,
        },
        unclassified_tokens: 0,
      },
    })).toMatchObject({
      accountingVersion: 2,
      inputTokens: 10,
      inputTotalTokens: 95,
      cacheReadTokens: 80,
      cacheWriteTokens: 5,
      outputTotalTokens: 7,
      reasoningTokens: 2,
      totalTokens: 102,
    });
  });

  it("keeps legacy values when the v2 breakdown is inconsistent", () => {
    expect(normalizeTokenAccounting({
      accounting_version: 2,
      tokens: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      token_breakdown: {
        schema_version: 2,
        quality: "complete",
        total_tokens: 99,
        input: { total_tokens: 10, uncached_tokens: 10, cache_read_tokens: 0, cache_write_tokens: 0 },
        output: { total_tokens: 2, non_reasoning_tokens: 2, reasoning_tokens: 0 },
        unclassified_tokens: 0,
      },
    })).toMatchObject({
      accountingVersion: 1,
      accountingQuality: "legacy",
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    });
  });
});
