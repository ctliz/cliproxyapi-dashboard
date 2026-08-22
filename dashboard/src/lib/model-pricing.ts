/**
 * Default model pricing database.
 *
 * Prices are in USD per 1 million tokens.
 * Users can override these via the Settings page (persisted in localStorage).
 *
 * When a model is not found, we attempt prefix matching:
 *   "claude-sonnet-4.5-xxx" → matches "claude-sonnet-4.5"
 * If still unmatched the request is tagged as "unpriced".
 */

export interface ModelPrice {
  /** Display name for the model family */
  displayName: string;
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
  /** USD per 1M cache-read tokens. Defaults to the input rate. */
  cachedInputPer1M?: number;
  /** USD per 1M cache-write tokens. Defaults to the input rate. */
  cacheWritePer1M?: number;
  /** Input-token threshold at which the full request uses long-context rates. */
  longContextThreshold?: number;
  /** Rates applied to the full request after the long-context threshold. */
  longContextRates?: TokenRates;
  /** Overrides for request/response service tiers such as flex or priority. */
  serviceTierRates?: Record<string, TierRates>;
  /** The provider has not published a comparable API token price. */
  pricingUnavailable?: boolean;
  /** Optional: provider grouping */
  provider: string;
}

export interface TokenRates {
  inputPer1M: number;
  cachedInputPer1M: number;
  cacheWritePer1M: number;
  outputPer1M: number;
}

export interface TierRates extends TokenRates {
  longContextRates?: TokenRates;
}

export interface PricingBucket {
  requests: number;
  inputTokens: number;
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  longContext: boolean;
  serviceTier: string;
}

const rates = (
  inputPer1M: number,
  cachedInputPer1M: number,
  cacheWritePer1M: number,
  outputPer1M: number
): TokenRates => ({ inputPer1M, cachedInputPer1M, cacheWritePer1M, outputPer1M });

/**
 * Built-in pricing table.  Keep alphabetically sorted by key.
 * Source: official provider pricing pages checked August 2026.
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPrice> = {
  // ── Anthropic ──────────────────────────────────────────────
  "claude-haiku": {
    displayName: "Claude Haiku",
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    provider: "Anthropic",
  },
  "claude-haiku-4.5": {
    displayName: "Claude Haiku 4.5",
    inputPer1M: 1,
    outputPer1M: 5,
    cachedInputPer1M: 0.1,
    cacheWritePer1M: 1.25,
    provider: "Anthropic",
  },
  "claude-sonnet-4": {
    displayName: "Claude Sonnet 4",
    inputPer1M: 3,
    outputPer1M: 15,
    cachedInputPer1M: 0.3,
    cacheWritePer1M: 3.75,
    provider: "Anthropic",
  },
  "claude-sonnet-4.5": {
    displayName: "Claude Sonnet 4.5",
    inputPer1M: 3,
    outputPer1M: 15,
    cachedInputPer1M: 0.3,
    cacheWritePer1M: 3.75,
    provider: "Anthropic",
  },
  "claude-sonnet-5": {
    displayName: "Claude Sonnet 5",
    inputPer1M: 2,
    outputPer1M: 10,
    cachedInputPer1M: 0.2,
    cacheWritePer1M: 2.5,
    provider: "Anthropic",
  },
  "claude-opus-4": {
    displayName: "Claude Opus 4",
    inputPer1M: 15,
    outputPer1M: 75,
    provider: "Anthropic",
  },
  "claude-opus-4.6": {
    displayName: "Claude Opus 4.6",
    inputPer1M: 5,
    outputPer1M: 25,
    cachedInputPer1M: 0.5,
    cacheWritePer1M: 6.25,
    provider: "Anthropic",
  },
  "claude-opus-4.5": {
    displayName: "Claude Opus 4.5",
    inputPer1M: 5,
    outputPer1M: 25,
    cachedInputPer1M: 0.5,
    cacheWritePer1M: 6.25,
    provider: "Anthropic",
  },
  "claude-opus-4.7": {
    displayName: "Claude Opus 4.7",
    inputPer1M: 5,
    outputPer1M: 25,
    cachedInputPer1M: 0.5,
    cacheWritePer1M: 6.25,
    provider: "Anthropic",
  },
  "claude-opus-4.8": {
    displayName: "Claude Opus 4.8",
    inputPer1M: 5,
    outputPer1M: 25,
    cachedInputPer1M: 0.5,
    cacheWritePer1M: 6.25,
    provider: "Anthropic",
  },
  "claude-opus-5": {
    displayName: "Claude Opus 5",
    inputPer1M: 5,
    cachedInputPer1M: 0.5,
    cacheWritePer1M: 6.25,
    outputPer1M: 25,
    provider: "Anthropic",
  },
  "claude-fable-5": {
    displayName: "Claude Fable 5",
    inputPer1M: 10,
    cachedInputPer1M: 1,
    cacheWritePer1M: 12.5,
    outputPer1M: 50,
    provider: "Anthropic",
  },

  // ── OpenAI ─────────────────────────────────────────────────
  "gpt-4o": {
    displayName: "GPT-4o",
    inputPer1M: 2.5,
    outputPer1M: 10,
    provider: "OpenAI",
  },
  "gpt-4o-mini": {
    displayName: "GPT-4o Mini",
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    provider: "OpenAI",
  },
  "gpt-5": {
    displayName: "GPT-5",
    inputPer1M: 2.5,
    outputPer1M: 10,
    provider: "OpenAI",
  },
  "gpt-5.2": {
    displayName: "GPT-5.2",
    inputPer1M: 2.5,
    outputPer1M: 10,
    provider: "OpenAI",
  },
  "gpt-5.3-codex-spark": {
    displayName: "GPT-5.3-Codex-Spark",
    inputPer1M: 0,
    outputPer1M: 0,
    provider: "OpenAI",
    pricingUnavailable: true,
  },
  "gpt-5.4-mini": {
    displayName: "GPT-5.4 Mini",
    inputPer1M: 0.75,
    cachedInputPer1M: 0.075,
    outputPer1M: 4.5,
    provider: "OpenAI",
  },
  "gpt-5.5": {
    displayName: "GPT-5.5",
    inputPer1M: 5,
    cachedInputPer1M: 0.5,
    outputPer1M: 30,
    longContextThreshold: 272_000,
    longContextRates: rates(10, 1, 10, 45),
    provider: "OpenAI",
  },
  "gpt-5.6-sol": {
    // Promotional Standard and Fast rates are available at least through 2026-11-21.
    displayName: "GPT-5.6 Sol",
    inputPer1M: 4,
    cachedInputPer1M: 0.4,
    cacheWritePer1M: 5,
    outputPer1M: 20,
    longContextThreshold: 272_000,
    longContextRates: rates(8, 0.8, 10, 30),
    serviceTierRates: {
      batch: { ...rates(2, 0.2, 2.5, 10), longContextRates: rates(4, 0.4, 5, 15) },
      flex: { ...rates(2, 0.2, 2.5, 10), longContextRates: rates(4, 0.4, 5, 15) },
      fast: { ...rates(8, 0.8, 10, 40), longContextRates: rates(16, 1.6, 20, 60) },
      priority: { ...rates(8, 0.8, 10, 40), longContextRates: rates(16, 1.6, 20, 60) },
    },
    provider: "OpenAI",
  },
  "gpt-5.6-terra": {
    displayName: "GPT-5.6 Terra",
    inputPer1M: 2,
    cachedInputPer1M: 0.2,
    cacheWritePer1M: 2.5,
    outputPer1M: 12,
    longContextThreshold: 272_000,
    longContextRates: rates(4, 0.4, 5, 18),
    serviceTierRates: {
      batch: { ...rates(1, 0.1, 1.25, 6), longContextRates: rates(2, 0.2, 2.5, 9) },
      flex: { ...rates(1, 0.1, 1.25, 6), longContextRates: rates(2, 0.2, 2.5, 9) },
      fast: { ...rates(4, 0.4, 5, 24), longContextRates: rates(8, 0.8, 10, 36) },
      priority: { ...rates(4, 0.4, 5, 24), longContextRates: rates(8, 0.8, 10, 36) },
    },
    provider: "OpenAI",
  },
  "gpt-5.6-luna": {
    displayName: "GPT-5.6 Luna",
    inputPer1M: 0.2,
    cachedInputPer1M: 0.02,
    cacheWritePer1M: 0.25,
    outputPer1M: 1.2,
    longContextThreshold: 272_000,
    longContextRates: rates(0.4, 0.04, 0.5, 1.8),
    serviceTierRates: {
      batch: { ...rates(0.1, 0.01, 0.125, 0.6), longContextRates: rates(0.2, 0.02, 0.25, 0.9) },
      flex: { ...rates(0.1, 0.01, 0.125, 0.6), longContextRates: rates(0.2, 0.02, 0.25, 0.9) },
      fast: { ...rates(0.4, 0.04, 0.5, 2.4), longContextRates: rates(0.8, 0.08, 1, 3.6) },
      priority: { ...rates(0.4, 0.04, 0.5, 2.4), longContextRates: rates(0.8, 0.08, 1, 3.6) },
    },
    provider: "OpenAI",
  },
  "gpt-image-2": {
    displayName: "GPT Image 2 (image-token estimate)",
    inputPer1M: 8,
    cachedInputPer1M: 2,
    outputPer1M: 30,
    provider: "OpenAI",
  },
  "o3": {
    displayName: "o3",
    inputPer1M: 10,
    outputPer1M: 40,
    provider: "OpenAI",
  },
  "o3-mini": {
    displayName: "o3-mini",
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    provider: "OpenAI",
  },
  "o4-mini": {
    displayName: "o4-mini",
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    provider: "OpenAI",
  },

  // ── Google ─────────────────────────────────────────────────
  "gemini-2.5-pro": {
    displayName: "Gemini 2.5 Pro",
    inputPer1M: 1.25,
    outputPer1M: 10,
    provider: "Google",
  },
  "gemini-2.5-flash": {
    displayName: "Gemini 2.5 Flash",
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    provider: "Google",
  },
  "gemini-3.7-flash": {
    displayName: "Gemini 3.7 Flash",
    inputPer1M: 0.75,
    cachedInputPer1M: 0.075,
    outputPer1M: 3.75,
    serviceTierRates: {
      batch: rates(0.375, 0.0375, 0.375, 1.875),
      flex: rates(0.375, 0.0375, 0.375, 1.875),
      priority: rates(1.35, 0.135, 1.35, 6.75),
    },
    provider: "Google",
  },
  "gemini-3.6-flash": {
    displayName: "Gemini 3.6 Flash",
    inputPer1M: 0.75,
    cachedInputPer1M: 0.075,
    outputPer1M: 3.75,
    serviceTierRates: {
      batch: rates(0.375, 0.0375, 0.375, 1.875),
      flex: rates(0.375, 0.0375, 0.375, 1.875),
      priority: rates(1.35, 0.135, 1.35, 6.75),
    },
    provider: "Google",
  },
  "gemini-3.5-flash": {
    displayName: "Gemini 3.5 Flash",
    inputPer1M: 1.5,
    cachedInputPer1M: 0.15,
    outputPer1M: 9,
    provider: "Google",
  },
  "gemini-3.1-flash-lite": {
    displayName: "Gemini 3.1 Flash-Lite",
    inputPer1M: 0.25,
    cachedInputPer1M: 0.025,
    outputPer1M: 1.5,
    provider: "Google",
  },

  // ── xAI ───────────────────────────────────────────────────
  "grok-4.6": {
    displayName: "Grok 4.6",
    inputPer1M: 2,
    cachedInputPer1M: 0.5,
    outputPer1M: 6,
    longContextThreshold: 200_000,
    longContextRates: rates(4, 1, 4, 12),
    provider: "xAI",
  },

  // ── Perplexity ─────────────────────────────────────────────
  "sonar": {
    displayName: "Sonar",
    inputPer1M: 1,
    outputPer1M: 1,
    provider: "Perplexity",
  },
  "sonar-pro": {
    displayName: "Sonar Pro",
    inputPer1M: 3,
    outputPer1M: 15,
    provider: "Perplexity",
  },
  "sonar-reasoning": {
    displayName: "Sonar Reasoning",
    inputPer1M: 1,
    outputPer1M: 5,
    provider: "Perplexity",
  },
  "sonar-reasoning-pro": {
    displayName: "Sonar Reasoning Pro",
    inputPer1M: 2,
    outputPer1M: 8,
    provider: "Perplexity",
  },
  "sonar-deep-research": {
    displayName: "Sonar Deep Research",
    inputPer1M: 2,
    outputPer1M: 8,
    provider: "Perplexity",
  },
};

const LOCALSTORAGE_KEY = "cliproxy-custom-pricing-v2";

/**
 * Resolve the price for a given model name.
 *
 * 1. Exact match against user overrides → built-in table
 * 2. Longest-prefix match (e.g. "claude-sonnet-4.5-20260620" → "claude-sonnet-4.5")
 * 3. null if no match found
 */
export function resolveModelPrice(model: string, customPricing?: Record<string, ModelPrice>): ModelPrice | null {
  const lowerModel = model.toLowerCase();
  // CPA provider aliases commonly use `4-6`, while pricing tables use `4.6`.
  // Keep both forms so aliases such as `claude-opus-4-6-thinking` resolve.
  const normalizedModel = lowerModel.replace(/(\d+)-(\d+)/g, "$1.$2");
  const normalizedCustom: Record<string, ModelPrice> = {};
  if (customPricing) {
    for (const [k, v] of Object.entries(customPricing)) {
      normalizedCustom[k.toLowerCase()] = v;
    }
  }
  const merged = { ...DEFAULT_MODEL_PRICING, ...normalizedCustom };

  // Exact match
  if (merged[lowerModel]) return merged[lowerModel];
  if (merged[normalizedModel]) return merged[normalizedModel];

  // Prefix match: try progressively shorter prefixes
  const keys = Object.keys(merged).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const matchedPrice = merged[key];
    if (!matchedPrice) continue;
    if (lowerModel.startsWith(key) || normalizedModel.startsWith(key)) return matchedPrice;
  }

  // Try matching without provider prefix (e.g. "cliproxyapi/sonar-pro" → "sonar-pro")
  const withoutPrefix = lowerModel.includes("/") ? lowerModel.split("/").pop()! : null;
  if (withoutPrefix) {
    if (merged[withoutPrefix]) return merged[withoutPrefix];
    const normalizedWithoutPrefix = withoutPrefix.replace(/(\d+)-(\d+)/g, "$1.$2");
    if (merged[normalizedWithoutPrefix]) return merged[normalizedWithoutPrefix];
    for (const key of keys) {
      const matchedPrice = merged[key];
      if (!matchedPrice) continue;
      if (withoutPrefix.startsWith(key) || normalizedWithoutPrefix.startsWith(key)) return matchedPrice;
    }
  }

  return null;
}

/**
 * Calculate estimated cost for a set of tokens.
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  price: ModelPrice
): number {
  return (inputTokens / 1_000_000) * price.inputPer1M + (outputTokens / 1_000_000) * price.outputPer1M;
}

function baseRates(price: ModelPrice): TokenRates {
  return rates(
    price.inputPer1M,
    price.cachedInputPer1M ?? price.inputPer1M,
    price.cacheWritePer1M ?? price.inputPer1M,
    price.outputPer1M
  );
}

export function resolveBucketRates(price: ModelPrice, bucket: PricingBucket): TokenRates {
  const tier = bucket.serviceTier.trim().toLowerCase();
  const tierRates = price.serviceTierRates?.[tier];
  if (bucket.longContext) {
    return tierRates?.longContextRates ?? price.longContextRates ?? tierRates ?? baseRates(price);
  }
  return tierRates ?? baseRates(price);
}

export function calculateBucketCost(bucket: PricingBucket, price: ModelPrice): number {
  const selected = resolveBucketRates(price, bucket);
  return (
    (bucket.uncachedInputTokens / 1_000_000) * selected.inputPer1M
    + (bucket.cacheReadTokens / 1_000_000) * selected.cachedInputPer1M
    + (bucket.cacheWriteTokens / 1_000_000) * selected.cacheWritePer1M
    + (bucket.outputTokens / 1_000_000) * selected.outputPer1M
  );
}

export function calculateCostFromBuckets(buckets: PricingBucket[], price: ModelPrice): number {
  return buckets.reduce((total, bucket) => total + calculateBucketCost(bucket, price), 0);
}

/**
 * Load user-customized pricing from localStorage.
 */
export function loadCustomPricing(): Record<string, ModelPrice> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, ModelPrice>;
  } catch {
    return {};
  }
}

/**
 * Save user-customized pricing to localStorage.
 */
export function saveCustomPricing(pricing: Record<string, ModelPrice>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(pricing));
}

/**
 * Format a USD amount for display.
 */
export function formatUSD(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 100) return `${sign}$${abs.toFixed(0)}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(3)}`;
  return `${sign}$${abs.toFixed(4)}`;
}
