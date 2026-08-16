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
  /** Optional: provider grouping */
  provider: string;
}

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
    provider: "Anthropic",
  },
  "claude-sonnet-4": {
    displayName: "Claude Sonnet 4",
    inputPer1M: 3,
    outputPer1M: 15,
    provider: "Anthropic",
  },
  "claude-sonnet-4.5": {
    displayName: "Claude Sonnet 4.5",
    inputPer1M: 3,
    outputPer1M: 15,
    provider: "Anthropic",
  },
  "claude-sonnet-5": {
    displayName: "Claude Sonnet 5",
    inputPer1M: 2,
    outputPer1M: 10,
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
    provider: "Anthropic",
  },
  "claude-opus-4.5": {
    displayName: "Claude Opus 4.5",
    inputPer1M: 5,
    outputPer1M: 25,
    provider: "Anthropic",
  },
  "claude-opus-4.7": {
    displayName: "Claude Opus 4.7",
    inputPer1M: 5,
    outputPer1M: 25,
    provider: "Anthropic",
  },
  "claude-opus-4.8": {
    displayName: "Claude Opus 4.8",
    inputPer1M: 5,
    outputPer1M: 25,
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
  "gpt-5.6-sol": {
    displayName: "GPT-5.6 Sol",
    inputPer1M: 5,
    outputPer1M: 30,
    provider: "OpenAI",
  },
  "gpt-5.6-terra": {
    displayName: "GPT-5.6 Terra",
    inputPer1M: 2.5,
    outputPer1M: 15,
    provider: "OpenAI",
  },
  "gpt-5.6-luna": {
    displayName: "GPT-5.6 Luna",
    inputPer1M: 1,
    outputPer1M: 6,
    provider: "OpenAI",
  },
  "gpt-image-2": {
    displayName: "GPT-Image-2 (text token estimate)",
    inputPer1M: 5,
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
    outputPer1M: 3.75,
    provider: "Google",
  },
  "gemini-3.6-flash": {
    displayName: "Gemini 3.6 Flash",
    inputPer1M: 0.75,
    outputPer1M: 3.75,
    provider: "Google",
  },
  "gemini-3.5-flash": {
    displayName: "Gemini 3.5 Flash",
    inputPer1M: 1.5,
    outputPer1M: 9,
    provider: "Google",
  },
  "gemini-3.1-flash-lite": {
    displayName: "Gemini 3.1 Flash-Lite",
    inputPer1M: 0.25,
    outputPer1M: 1.5,
    provider: "Google",
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

const LOCALSTORAGE_KEY = "cliproxy-custom-pricing";

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
