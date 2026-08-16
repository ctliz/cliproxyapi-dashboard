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

    // Call CLIProxyAPI Management API to hot-reload in memory if available
    try {
      const baseUrl =
        process.env.CLIPROXYAPI_MANAGEMENT_URL ||
        "http://cliproxyapi:8317/v0/management";
      const mgmtKey = process.env.MANAGEMENT_API_KEY;

      if (mgmtKey) {
        await fetch(`${baseUrl}/global-model-filter/policy`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mgmtKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
      }
    } catch (e) {
      logger.warn("Failed to notify CLIProxyAPI management endpoint for global-model-filter reload", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    logger.info("Successfully synced global-model-filter policy file", {
      filePath,
      excludedCount: excludedModels.length,
    });

    return {
      ok: true,
      excludedCount: excludedModels.length,
      filePath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to sync global-model-filter policy file", {
      filePath,
      error: errorMsg,
    });
    return {
      ok: false,
      error: errorMsg,
      filePath,
    };
  }
}
