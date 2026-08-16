import "server-only";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const DEFAULT_FILTER_FILE_PATH = "/Users/tsiji/.config/cliproxyapi/global-model-filter.json";

export interface GlobalModelFilterConfig {
  enabled: boolean;
  global_excluded_models?: string[];
  global_allowed_models?: string[];
  provider_rules?: Record<string, { excluded_models?: string[]; allowed_models?: string[] }>;
  action?: "reject" | "fallback";
  fallback?: {
    provider?: string;
    model?: string;
  };
  custom_reject_message?: string;
}

export interface FilterSyncSuccess {
  ok: true;
  excludedCount: number;
  filePath: string;
}

export interface FilterSyncFailure {
  ok: false;
  error: string;
  filePath: string;
  excludedCount?: number;
}

export type FilterSyncResult = FilterSyncSuccess | FilterSyncFailure;

export function getGlobalModelFilterFilePath(): string {
  return (
    process.env.CLIPROXYAPI_GLOBAL_MODEL_FILTER?.trim() ||
    DEFAULT_FILTER_FILE_PATH
  );
}

/**
 * Maps model exclusions to provider-specific keys expected by CLIProxyAPI's
 * `oauth-excluded-models` endpoint (e.g. codex, claude, antigravity, gemini, vertex).
 */
export function mapExcludedModelsToOAuthProviders(
  excludedModels: string[],
  modelOwnedByMap?: Record<string, string>
): Record<string, string[]> {
  const result: Record<string, Set<string>> = {
    antigravity: new Set(),
    claude: new Set(),
    codex: new Set(),
    gemini: new Set(),
    vertex: new Set(),
    xai: new Set(),
    kimi: new Set(),
    kiro: new Set(),
    iflow: new Set(),
    copilot: new Set(),
  };

  const add = (provider: string, model: string) => {
    if (!result[provider]) {
      result[provider] = new Set();
    }
    result[provider].add(model);
  };

  for (const model of excludedModels) {
    const trimmed = model.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    const ownedBy = modelOwnedByMap?.[trimmed]?.toLowerCase();

    let matched = false;

    if (ownedBy) {
      if (ownedBy === "anthropic" || ownedBy === "claude") {
        add("claude", trimmed);
        matched = true;
      } else if (ownedBy === "openai" || ownedBy === "codex") {
        add("codex", trimmed);
        matched = true;
      } else if (ownedBy === "antigravity") {
        add("antigravity", trimmed);
        matched = true;
      } else if (ownedBy === "google" || ownedBy === "gemini") {
        add("gemini", trimmed);
        add("antigravity", trimmed);
        matched = true;
      } else if (ownedBy === "vertex") {
        add("vertex", trimmed);
        matched = true;
      } else if (ownedBy === "xai") {
        add("xai", trimmed);
        matched = true;
      } else if (ownedBy === "kimi" || ownedBy === "moonshot") {
        add("kimi", trimmed);
        matched = true;
      } else if (ownedBy === "kiro" || ownedBy === "aws") {
        add("kiro", trimmed);
        matched = true;
      } else if (ownedBy === "iflow") {
        add("iflow", trimmed);
        matched = true;
      } else if (ownedBy === "copilot" || ownedBy === "github-copilot") {
        add("copilot", trimmed);
        matched = true;
      }
    }

    if (!matched) {
      if (lower.startsWith("claude-")) {
        add("claude", trimmed);
      } else if (
        lower.startsWith("gpt-") ||
        lower.startsWith("o1") ||
        lower.startsWith("o3") ||
        lower.startsWith("o4") ||
        lower.startsWith("codex-") ||
        lower.includes("codex")
      ) {
        add("codex", trimmed);
      } else if (lower.startsWith("gemini-") || lower.startsWith("imagen-")) {
        add("antigravity", trimmed);
        add("gemini", trimmed);
        add("vertex", trimmed);
      } else if (lower.startsWith("grok-") || lower.startsWith("xai/")) {
        add("xai", trimmed);
      } else if (lower.startsWith("kimi-") || lower.startsWith("moonshot/")) {
        add("kimi", trimmed);
      } else if (lower.startsWith("kiro-") || lower.startsWith("amazonq-")) {
        add("kiro", trimmed);
      } else if (
        lower.startsWith("glm-") ||
        lower.startsWith("iflow-") ||
        lower.startsWith("minimax-") ||
        lower.startsWith("tstars")
      ) {
        add("iflow", trimmed);
      } else if (lower.startsWith("copilot-")) {
        add("copilot", trimmed);
      } else {
        // Unknown or custom: register across standard providers
        add("antigravity", trimmed);
        add("claude", trimmed);
        add("codex", trimmed);
      }
    }
  }

  const output: Record<string, string[]> = {};
  for (const [provider, set] of Object.entries(result)) {
    if (set.size > 0) {
      output[provider] = Array.from(set).sort((a, b) => a.localeCompare(b));
    }
  }
  return output;
}

export async function syncGlobalModelFilter(userId?: string): Promise<FilterSyncResult> {
  const filePath = getGlobalModelFilterFilePath();

  try {
    let excludedModels: string[] = [];

    if (userId) {
      const pref = await prisma.modelPreference.findUnique({
        where: { userId },
        select: { excludedModels: true },
      });
      excludedModels = pref?.excludedModels ?? [];
    } else {
      const allPrefs = await prisma.modelPreference.findMany({
        select: { excludedModels: true },
      });
      const set = new Set<string>();
      for (const p of allPrefs) {
        for (const m of p.excludedModels) {
          set.add(m);
        }
      }
      excludedModels = Array.from(set);
    }

    const payload: GlobalModelFilterConfig = {
      enabled: excludedModels.length > 0,
      global_excluded_models: excludedModels,
      action: "reject",
      fallback: {},
    };

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(tempPath, filePath);

    // Call CLIProxyAPI Management APIs to hot-reload in memory
    const baseUrl =
      process.env.CLIPROXYAPI_MANAGEMENT_URL ||
      "http://cliproxyapi:8317/v0/management";
    const mgmtKey = process.env.MANAGEMENT_API_KEY;

    if (mgmtKey) {
      // 1. Update runtime execution filter plugin policy
      try {
        await fetch(`${baseUrl}/global-model-filter/policy`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mgmtKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
      } catch (e) {
        logger.warn(
          { error: e instanceof Error ? e.message : String(e) },
          "Failed to notify CLIProxyAPI management endpoint for global-model-filter reload"
        );
      }

      // 2. Update native directory exclusion map (hides models from GET /v1/models immediately)
      try {
        const oauthExcludedPayload = mapExcludedModelsToOAuthProviders(excludedModels);
        await fetch(`${baseUrl}/oauth-excluded-models`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${mgmtKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(oauthExcludedPayload),
          cache: "no-store",
        });
      } catch (e) {
        logger.warn(
          { error: e instanceof Error ? e.message : String(e) },
          "Failed to update CLIProxyAPI oauth-excluded-models endpoint"
        );
      }
    }

    logger.info(
      { filePath, excludedCount: excludedModels.length },
      "Successfully synced global-model-filter and oauth-excluded-models"
    );

    return {
      ok: true,
      excludedCount: excludedModels.length,
      filePath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { filePath, error: errorMsg },
      "Failed to sync global-model-filter policy file"
    );
    return {
      ok: false,
      error: errorMsg,
      filePath,
    };
  }
}
