import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  buildAvailableModelIds,
  fetchProxyModels,
  type ProxyModel,
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

const KNOWN_PROVIDER_DEFS: { id: string; name: string }[] = [
  { id: "antigravity", name: "Antigravity" },
  { id: "anthropic", name: "Anthropic / Claude" },
  { id: "google", name: "Google / Gemini" },
  { id: "openai", name: "OpenAI" },
  { id: "codex", name: "Codex" },
  { id: "moonshot", name: "Moonshot / Kimi" },
  { id: "kiro", name: "Kiro" },
  { id: "iflow", name: "iFlow" },
  { id: "qwen", name: "Qwen" },
];

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

function extractOAuthAccounts(data: unknown): { id: string; name: string; provider?: string }[] {
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
      provider: typeof entry.provider === "string" ? entry.provider : undefined,
    }));
}

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  try {
    // 1. Fetch user's API key to query /v1/models directly
    const userApiKeys = await prisma.userApiKey.findMany({
      where: { userId: session.userId },
      select: { key: true },
      orderBy: { createdAt: "desc" },
    });

    let proxyModels: ProxyModel[] = [];
    const proxyUrl = getInternalProxyUrl();

    // Try user keys to query live /v1/models
    for (const k of userApiKeys) {
      if (!k.key) continue;
      proxyModels = await fetchProxyModels(proxyUrl, k.key);
      if (proxyModels.length > 0) break;
    }

    // 2. Parallel fetch of management config, auth-files, and custom providers
    const [managementConfig, authFilesData, customProviders, modelPreference] = await Promise.all([
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
      prisma.modelPreference.findUnique({
        where: { userId: session.userId },
        select: { excludedModels: true },
      }),
    ]);

    const oauthAccounts = extractOAuthAccounts(authFilesData);
    const oauthAliases = extractOAuthModelAliases(
      managementConfig as ConfigData | null,
      oauthAccounts
    );
    const oauthAliasIds = Object.keys(oauthAliases);

    const customModelIds = customProviders.flatMap((cp) =>
      cp.models.map((m) => m.alias || m.upstreamName)
    );

    // Combine all live discovered models
    const liveDiscoveredIds = buildAvailableModelIds(proxyModels, [
      ...oauthAliasIds,
      ...customModelIds,
    ]);

    // Fallback to standard models if proxy is completely empty
    const fallbackAll = Object.values(STANDARD_MODELS).flat();
    // Keep excluded models in the dashboard catalog so users can re-enable them.
    const allModels = Array.from(
      new Set([
        ...(liveDiscoveredIds.length > 0 ? liveDiscoveredIds : fallbackAll),
        ...(modelPreference?.excludedModels ?? []),
      ])
    ).sort((a, b) => a.localeCompare(b));

    // Build source mapping
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

    // Group live models dynamically by provider ID
    const liveProviderModelsMap = new Map<string, Set<string>>();

    for (const m of proxyModels) {
      const pId = (m.owned_by || "other").toLowerCase();
      if (!liveProviderModelsMap.has(pId)) {
        liveProviderModelsMap.set(pId, new Set());
      }
      liveProviderModelsMap.get(pId)!.add(m.id);
    }

    // Add OAuth aliases to their respective providers if known
    if (managementConfig && typeof managementConfig === "object") {
      const aliasesObj = (managementConfig as Record<string, unknown>)["oauth-model-alias"];
      if (aliasesObj && typeof aliasesObj === "object") {
        for (const [providerKey, aliasEntries] of Object.entries(aliasesObj)) {
          if (!Array.isArray(aliasEntries)) continue;
          const pId = providerKey.toLowerCase();
          if (!liveProviderModelsMap.has(pId)) {
            liveProviderModelsMap.set(pId, new Set());
          }
          for (const entry of aliasEntries) {
            if (entry && typeof entry === "object" && typeof entry.alias === "string") {
              liveProviderModelsMap.get(pId)!.add(entry.alias);
            }
          }
        }
      }
    }

    // Build providers list dynamically
    const providersList: { id: string; name: string; models: string[] }[] = [];
    const processedProviderIds = new Set<string>();

    for (const def of KNOWN_PROVIDER_DEFS) {
      processedProviderIds.add(def.id.toLowerCase());
      const liveSet = liveProviderModelsMap.get(def.id.toLowerCase());
      const models =
        liveSet && liveSet.size > 0
          ? Array.from(liveSet).sort((a, b) => a.localeCompare(b))
          : STANDARD_MODELS[def.id] || [];

      providersList.push({
        id: def.id,
        name: def.name,
        models,
      });
    }

    // Add any other provider discovered in proxyModels not in KNOWN_PROVIDER_DEFS
    for (const [pId, modelsSet] of liveProviderModelsMap.entries()) {
      if (!processedProviderIds.has(pId)) {
        processedProviderIds.add(pId);
        providersList.push({
          id: pId,
          name: resolveOwnedByDisplay(pId),
          models: Array.from(modelsSet).sort((a, b) => a.localeCompare(b)),
        });
      }
    }

    // Add custom providers from database
    for (const cp of customProviders) {
      const pId = cp.providerId.toLowerCase();
      if (!processedProviderIds.has(pId)) {
        processedProviderIds.add(pId);
        providersList.push({
          id: cp.providerId,
          name: cp.name || cp.providerId,
          models: cp.models.map((m) => m.alias || m.upstreamName),
        });
      }
    }

    return NextResponse.json({
      models: allModels,
      groups: grouped,
      providers: providersList,
      source: proxyModels.length > 0 ? "live" : "fallback",
      discoveredCount: liveDiscoveredIds.length,
    });
  } catch (error) {
    return Errors.internal("Failed to fetch models", error);
  }
}
