export interface QueueTokenDetails {
  input_tokens?: unknown;
  output_tokens?: unknown;
  reasoning_tokens?: unknown;
  cached_tokens?: unknown;
  cache_read_tokens?: unknown;
  cache_creation_tokens?: unknown;
  total_tokens?: unknown;
}

interface QueueTokenBreakdown {
  schema_version?: unknown;
  quality?: unknown;
  total_tokens?: unknown;
  input?: {
    total_tokens?: unknown;
    uncached_tokens?: unknown;
    cache_read_tokens?: unknown;
    cache_write_tokens?: unknown;
  };
  output?: {
    total_tokens?: unknown;
    non_reasoning_tokens?: unknown;
    reasoning_tokens?: unknown;
  };
  unclassified_tokens?: unknown;
}

export interface QueueAccountingEntry {
  accounting_version?: unknown;
  token_breakdown?: QueueTokenBreakdown;
  tokens?: QueueTokenDetails;
}

export interface NormalizedTokenAccounting {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  accountingVersion: number;
  accountingQuality: string;
  inputTotalTokens: number;
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTotalTokens: number;
  nonReasoningOutputTokens: number;
  unclassifiedTokens: number;
}

function tokenCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function validQuality(value: unknown): value is string {
  return value === "complete" || value === "inconsistent" || value === "unclassified";
}

export function normalizeTokenAccounting(entry: QueueAccountingEntry): NormalizedTokenAccounting {
  const tokens = entry.tokens ?? {};
  const inputTokens = tokenCount(tokens.input_tokens);
  const outputTokens = tokenCount(tokens.output_tokens);
  const reasoningTokens = tokenCount(tokens.reasoning_tokens);
  const cachedTokens = tokenCount(tokens.cached_tokens);
  const rawTotalTokens = tokenCount(tokens.total_tokens);
  const breakdown = entry.token_breakdown;

  if (tokenCount(entry.accounting_version) >= 2 && breakdown && tokenCount(breakdown.schema_version) >= 2) {
    const inputTotalTokens = tokenCount(breakdown.input?.total_tokens);
    const uncachedInputTokens = tokenCount(breakdown.input?.uncached_tokens);
    const cacheReadTokens = tokenCount(breakdown.input?.cache_read_tokens);
    const cacheWriteTokens = tokenCount(breakdown.input?.cache_write_tokens);
    const outputTotalTokens = tokenCount(breakdown.output?.total_tokens);
    const nonReasoningOutputTokens = tokenCount(breakdown.output?.non_reasoning_tokens);
    const canonicalReasoningTokens = tokenCount(breakdown.output?.reasoning_tokens);
    const unclassifiedTokens = tokenCount(breakdown.unclassified_tokens);
    const totalTokens = tokenCount(breakdown.total_tokens);
    const valid = inputTotalTokens === uncachedInputTokens + cacheReadTokens + cacheWriteTokens
      && outputTotalTokens === nonReasoningOutputTokens + canonicalReasoningTokens
      && totalTokens === inputTotalTokens + outputTotalTokens + unclassifiedTokens;

    if (valid) {
      return {
        inputTokens,
        outputTokens,
        reasoningTokens: canonicalReasoningTokens,
        cachedTokens,
        totalTokens,
        accountingVersion: 2,
        accountingQuality: validQuality(breakdown.quality) ? breakdown.quality : "complete",
        inputTotalTokens,
        uncachedInputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        outputTotalTokens,
        nonReasoningOutputTokens,
        unclassifiedTokens,
      };
    }
  }

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens,
    totalTokens: rawTotalTokens,
    accountingVersion: 1,
    accountingQuality: "legacy",
    inputTotalTokens: 0,
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTotalTokens: 0,
    nonReasoningOutputTokens: 0,
    unclassifiedTokens: 0,
  };
}
