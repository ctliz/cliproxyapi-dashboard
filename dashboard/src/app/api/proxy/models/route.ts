import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  buildAvailableModelIds,
  fetchProxyModels,
} from "@/lib/config-generators/shared";
import {
  getInternalProxyUrl,
  extractOAuthModelAliases,
} from "@/lib/config-generators/opencode";
import {
  groupModelsByProvider,
  resolveOwnedByDisplay,
} from "@/lib/providers/model-grouping";
import type { ConfigData } from "@/lib/config-generators/shared";
import { Errors } from "@/lib/errors";

const STANDARD_MODELS: Record<string, string[]> = {
  antigravity: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet",
  ],
  anthropic: [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o1-mini",
    "o3-mini",
    "gpt-4-turbo",
  ],
  codex: [
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o3-mini",
  ],
  moonshot: [
    "kimi-k1.5",
    "kimi-k2",
  ],
  kiro: [
    "kiro-claude-3-5-sonnet",
  ],
  iflow: [
    "glm-4-flash",
    "minimax-01",
  ],
  qwen: [
    "qwen-2.5-72b",
    "qwen-2.5-32b",
  ],
};

async function fetchManagementJson(path: string) {
  try {
    const baseUrl =
      process.env.CLIPROXYAPI_MANAGEMENT_URL ||
      "http://cliproxyapi:8317/v0/management";
    const res = await fetch(`${baseUrl}/${path}`, {
      headers: {
        Authorization: `Bearer ${process.env.MANAGEMENT_API_KEY}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

function extractOAuthAccounts(data: unknown): { id: string; name: string }[] {
  if (typeof data !== "object" || data === null) return [];
  const record = data as Record<string, unknown>;
  const files = record["files"];
  if (!Array.isArray(files)) return [];
  return files
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null && "name" in entry
    )
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : String(entry.name),
      name: String(entry.name),
    }));
}

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  try {
    // 1. Fetch user's API key to probe proxy models
    const userApiKeys = await prisma.userApiKey.findMany({
      where: { userId: session.userId },
      select: { key: true },
      take: 1,
    });
    const apiKeyForProxy = userApiKeys[0]?.key || "";

    // 2. Fetch management data & custom providers in parallel
    const [managementConfig, authFilesData, customProviders] = await Promise.all([
      fetchManagementJson("config"),
      fetchManagementJson("auth-files"),
      prisma.customProvider.findMany({
        where: {
          OR: [{ userId: session.userId }, { isShared: true }],
        },
        include: {
          models: true,
        },
      }),
    ]);

    const proxyModels = apiKeyForProxy
      ? await fetchProxyModels(getInternalProxyUrl(), apiKeyForProxy)
      : [];

    const oauthAccounts = extractOAuthAccounts(authFilesData);
    const oauthAliasIds = Object.keys(
      extractOAuthModelAliases(managementConfig as ConfigData | null, oauthAccounts)
    );

    const customModelIds = customProviders.flatMap((cp) =>
      cp.models.map((m) => m.alias || m.upstreamName)
    );

    // Combine discovered models
    const discoveredModelIds = buildAvailableModelIds(proxyModels, [
      ...oauthAliasIds,
      ...customModelIds,
    ]);

    // Fallback to standard models if nothing discovered yet
    const fallbackAll = Object.values(STANDARD_MODELS).flat();
    const allModels = Array.from(
      new Set(discoveredModelIds.length > 0 ? discoveredModelIds : fallbackAll)
    ).sort((a, b) => a.localeCompare(b));

    const sourceMap = new Map<string, string>();
    for (const m of proxyModels) {
      sourceMap.set(m.id, resolveOwnedByDisplay(m.owned_by));
    }
    for (const cp of customProviders) {
      for (const m of cp.models) {
        sourceMap.set(m.alias || m.upstreamName, cp.name || cp.providerId);
      }
    }

    const grouped = groupModelsByProvider(allModels, sourceMap);

    // Build providers list for fallback selection
    const standardProviders = [
      { id: "antigravity", name: "Antigravity", models: STANDARD_MODELS.antigravity },
      { id: "anthropic", name: "Anthropic / Claude", models: STANDARD_MODELS.anthropic },
      { id: "google", name: "Google / Gemini", models: STANDARD_MODELS.google },
      { id: "openai", name: "OpenAI", models: STANDARD_MODELS.openai },
      { id: "codex", name: "Codex", models: STANDARD_MODELS.codex },
      { id: "moonshot", name: "Moonshot / Kimi", models: STANDARD_MODELS.moonshot },
      { id: "kiro", name: "Kiro", models: STANDARD_MODELS.kiro },
      { id: "iflow", name: "iFlow", models: STANDARD_MODELS.iflow },
      { id: "qwen", name: "Qwen", models: STANDARD_MODELS.qwen },
    ];

    const customProvidersList = customProviders.map((cp) => ({
      id: cp.providerId,
      name: cp.name || cp.providerId,
      models: cp.models.map((m) => m.alias || m.upstreamName),
    }));

    const providers = [...standardProviders, ...customProvidersList];

    return NextResponse.json({
      models: allModels,
      groups: grouped,
      providers,
    });
  } catch (error) {
    return Errors.internal("Failed to fetch models", error);
  }
}
