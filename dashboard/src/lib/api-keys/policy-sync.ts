import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const DEFAULT_POLICY_FILE_PATH = "/Users/tsiji/.config/cliproxyapi/token-model-policy.json";

export interface TokenModelPolicyRule {
  token_sha256: string;
  allowed_models: string[];
  fallback?: {
    provider: string;
    model: string;
  };
}

export interface TokenModelPolicyFile {
  rules: TokenModelPolicyRule[];
}

export interface PolicySyncSuccess {
  ok: true;
  rulesCount: number;
  filePath: string;
}

export interface PolicySyncFailure {
  ok: false;
  error: string;
  filePath: string;
  rulesCount?: number;
}

export type PolicySyncResult = PolicySyncSuccess | PolicySyncFailure;

export function getTokenModelPolicyFilePath(): string {
  return (
    process.env.CLIPROXYAPI_TOKEN_MODEL_POLICY?.trim() ||
    DEFAULT_POLICY_FILE_PATH
  );
}

export function computeTokenSha256(token: string): string {
  const clean = token.replace(/^(Bearer|bearer)\s+/i, "").trim();
  return crypto.createHash("sha256").update(clean).digest("hex");
}

export async function syncTokenModelPolicyFile(): Promise<PolicySyncResult> {
  const filePath = getTokenModelPolicyFilePath();

  try {
    const activeKeys = await prisma.userApiKey.findMany({
      where: {
        policyEnabled: true,
      },
      select: {
        key: true,
        allowedModels: true,
        fallbackProvider: true,
        fallbackModel: true,
      },
    });

    const rules: TokenModelPolicyRule[] = [];

    for (const item of activeKeys) {
      if (!item.key) continue;
      const rule: TokenModelPolicyRule = {
        token_sha256: computeTokenSha256(item.key),
        allowed_models: Array.isArray(item.allowedModels) ? item.allowedModels : [],
      };

      if (item.fallbackProvider?.trim() && item.fallbackModel?.trim()) {
        rule.fallback = {
          provider: item.fallbackProvider.trim(),
          model: item.fallbackModel.trim(),
        };
      }

      rules.push(rule);
    }

    const payload: TokenModelPolicyFile = { rules };
    const content = JSON.stringify(payload, null, 2) + "\n";

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file atomically via tmp file when possible
    const tempFile = `${filePath}.tmp.${Date.now()}`;
    try {
      await fs.writeFile(tempFile, content, "utf-8");
      await fs.rename(tempFile, filePath);
    } catch {
      // Fallback to direct write if rename fails (e.g. cross-device)
      await fs.writeFile(filePath, content, "utf-8");
      await fs.unlink(tempFile).catch(() => {});
    }

    logger.info(
      { filePath, rulesCount: rules.length },
      "Successfully synced token-model-policy.json"
    );

    return {
      ok: true,
      rulesCount: rules.length,
      filePath,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync policy file";
    logger.error({ error: message, filePath }, "Failed to write token-model-policy file");
    return {
      ok: false,
      error: message,
      filePath,
    };
  }
}

export async function readTokenModelPolicyFile(): Promise<TokenModelPolicyFile> {
  const filePath = getTokenModelPolicyFilePath();
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed && Array.isArray(parsed.rules)) {
      return parsed as TokenModelPolicyFile;
    }
    return { rules: [] };
  } catch {
    return { rules: [] };
  }
}
