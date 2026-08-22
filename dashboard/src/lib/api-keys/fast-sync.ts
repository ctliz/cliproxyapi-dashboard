import "server-only";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { computeTokenSha256 } from "@/lib/api-keys/policy-sync";

const DEFAULT_FAST_POLICY_FILE_PATH =
  "/Users/tsiji/.config/cliproxyapi/api-key-fast-policy.json";

export interface ApiKeyFastRule {
  api_key_name: string;
  token_sha256: string;
}

export interface ApiKeyFastPolicyFile {
  rules: ApiKeyFastRule[];
}

export interface FastPolicySyncResult {
  ok: boolean;
  rulesCount: number;
  filePath: string;
  error?: string;
}

export function getApiKeyFastPolicyFilePath(): string {
  return (
    process.env.CLIPROXYAPI_API_KEY_FAST_POLICY?.trim() ||
    DEFAULT_FAST_POLICY_FILE_PATH
  );
}

export async function syncApiKeyFastPolicyFile(): Promise<FastPolicySyncResult> {
  const filePath = getApiKeyFastPolicyFilePath();

  try {
    const fastKeys = await prisma.userApiKey.findMany({
      where: { fastEnabled: true },
      select: { name: true, key: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    const rules = fastKeys
      .filter((item) => item.name.trim() && item.key)
      .map((item) => ({
        api_key_name: item.name.trim(),
        token_sha256: computeTokenSha256(item.key),
      }));

    const content = JSON.stringify({ rules } satisfies ApiKeyFastPolicyFile, null, 2) + "\n";
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const tempFile = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    try {
      await fs.writeFile(tempFile, content, { encoding: "utf-8", mode: 0o600 });
      await fs.rename(tempFile, filePath);
    } catch {
      await fs.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
      await fs.unlink(tempFile).catch(() => {});
    }

    logger.info(
      { filePath, rulesCount: rules.length, apiKeyNames: rules.map((rule) => rule.api_key_name) },
      "Successfully synced API key Fast policy"
    );
    return { ok: true, rulesCount: rules.length, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Fast policy";
    logger.error({ error: message, filePath }, "Failed to write API key Fast policy");
    return { ok: false, rulesCount: 0, filePath, error: message };
  }
}
