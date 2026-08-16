import {
  enrichModelFirstGroup,
  type QuotaGroup,
} from "@/lib/model-first-monitoring";

export interface AntigravityModel {
  displayName?: string;
  quotaInfo?: {
    remainingFraction?: number | null;
    resetTime: string | null;
  };
}

const GROUP_ORDER = [
  "Claude/GPT",
  "Gemini 3.6 Flash",
  "Gemini 3.5 Flash",
  "Gemini 3.1 Pro",
  "Gemini 3.1 Flash",
  "Gemini 3 Pro",
  "Gemini 3 Flash",
  "Gemini 2.5 Pro",
  "Gemini 2.5 Flash",
  "Gemini Pro",
  "Gemini Flash",
  "Chat",
  "Tab Completion",
  "Other",
] as const;

function normalizeModelName(value: string): string {
  return value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function inferGeminiFamily(value: string): string | null {
  const normalized = normalizeModelName(value);
  const versioned = normalized.match(/(?:^|\s)gemini\s+(\d+(?:\s+\d+)*)\s+(pro|flash)(?:\s|$)/);

  if (versioned?.[1] && versioned[2]) {
    const version = versioned[1].replace(/\s+/g, ".");
    const family = versioned[2] === "pro" ? "Pro" : "Flash";
    return `Gemini ${version} ${family}`;
  }

  if (normalized.includes("gemini")) {
    if (normalized.includes(" pro")) return "Gemini Pro";
    if (normalized.includes(" flash")) return "Gemini Flash";
  }

  return null;
}

export function categorizeAntigravityModel(
  modelId: string,
  displayName?: string
): string {
  const candidates = [displayName, modelId].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (candidates.some((value) => /(?:^|[\s._-])(claude|gpt)(?:$|[\s._-])/i.test(value))) {
    return "Claude/GPT";
  }

  for (const candidate of candidates) {
    const geminiFamily = inferGeminiFamily(candidate);
    if (geminiFamily) return geminiFamily;
  }

  const normalizedId = modelId.trim().toLowerCase();
  if (normalizedId.startsWith("chat_")) return "Chat";
  if (normalizedId.startsWith("tab_")) return "Tab Completion";

  return "Other";
}

function compareGroups(left: QuotaGroup, right: QuotaGroup): number {
  const leftOrder = GROUP_ORDER.indexOf(left.label as (typeof GROUP_ORDER)[number]);
  const rightOrder = GROUP_ORDER.indexOf(right.label as (typeof GROUP_ORDER)[number]);
  const normalizedLeft = leftOrder === -1 ? GROUP_ORDER.length - 1 : leftOrder;
  const normalizedRight = rightOrder === -1 ? GROUP_ORDER.length - 1 : rightOrder;

  if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
  return left.label.localeCompare(right.label);
}

export function groupAntigravityModels(
  models: Record<string, AntigravityModel>
): QuotaGroup[] {
  const groups = new Map<string, QuotaGroup>();

  for (const [modelId, modelData] of Object.entries(models)) {
    if (!modelData.quotaInfo) continue;

    const remainingFraction =
      typeof modelData.quotaInfo.remainingFraction === "number" &&
      Number.isFinite(modelData.quotaInfo.remainingFraction)
        ? modelData.quotaInfo.remainingFraction
        : 0;
    const displayName = modelData.displayName?.trim() || modelId;
    const groupName = categorizeAntigravityModel(modelId, modelData.displayName);
    const existing = groups.get(groupName) ?? {
      id: groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: groupName,
      remainingFraction: 1,
      resetTime: null,
      models: [],
      windowType: "weekly",
    };

    existing.models.push({
      id: modelId,
      displayName,
      remainingFraction,
      resetTime: modelData.quotaInfo.resetTime,
    });
    groups.set(groupName, existing);
  }

  return Array.from(groups.values())
    .map((group) => {
      const sortedModels = [...group.models].sort((left, right) => {
        const resetLeft = left.resetTime ? Date.parse(left.resetTime) : Number.POSITIVE_INFINITY;
        const resetRight = right.resetTime ? Date.parse(right.resetTime) : Number.POSITIVE_INFINITY;
        if (resetLeft !== resetRight) return resetLeft - resetRight;
        return left.displayName.localeCompare(right.displayName);
      });

      return enrichModelFirstGroup({ ...group, models: sortedModels });
    })
    .sort(compareGroups);
}
