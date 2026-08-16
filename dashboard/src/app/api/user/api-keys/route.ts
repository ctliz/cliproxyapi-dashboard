import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { validateOrigin } from "@/lib/auth/origin";
import { generateApiKey } from "@/lib/api-keys/generate";
import { syncKeysToCliProxyApi } from "@/lib/api-keys/sync";
import { syncTokenModelPolicyFile } from "@/lib/api-keys/policy-sync";
import { prisma } from "@/lib/db";
import { checkRateLimitWithPreset } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { Errors, apiSuccess } from "@/lib/errors";

export interface ApiKeyResponse {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
  policyEnabled: boolean;
  allowedModels: string[];
  fallbackProvider: string | null;
  fallbackModel: string | null;
}

const CreateApiKeyRequestSchema = z.object({
  name: z.string().optional(),
  policyEnabled: z.boolean().optional(),
  allowedModels: z.array(z.string()).optional(),
  fallbackProvider: z.string().nullable().optional(),
  fallbackModel: z.string().nullable().optional(),
});

interface CreateApiKeyResponse {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  syncStatus: "ok" | "failed" | "pending";
  syncMessage?: string;
}

function maskApiKey(key: string): string {
  if (key.length < 12) return "sk-xxxx...xxxx";
  const prefix = key.slice(0, 7);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  try {
    const apiKeys = await prisma.userApiKey.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
        lastUsedAt: true,
        policyEnabled: true,
        allowedModels: true,
        fallbackProvider: true,
        fallbackModel: true,
      },
    });

    const response: ApiKeyResponse[] = apiKeys.map((apiKey) => ({
      id: apiKey.id,
      name: apiKey.name,
      keyPreview: maskApiKey(apiKey.key),
      createdAt: apiKey.createdAt.toISOString(),
      lastUsedAt: apiKey.lastUsedAt?.toISOString() || null,
      policyEnabled: apiKey.policyEnabled,
      allowedModels: apiKey.allowedModels,
      fallbackProvider: apiKey.fallbackProvider,
      fallbackModel: apiKey.fallbackModel,
    }));

    return NextResponse.json({ apiKeys: response });
  } catch (error) {
    return Errors.internal("Failed to fetch API keys", error);
  }
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimitWithPreset(request, "api-keys", "API_KEYS");
  if (!rateLimit.allowed) {
    return Errors.rateLimited(rateLimit.retryAfterSeconds);
  }

  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const body = await request.json();
    const parsed = CreateApiKeyRequestSchema.safeParse(body);

    if (!parsed.success) {
      return Errors.zodValidation(parsed.error.issues);
    }

    const key = generateApiKey();
    const name = parsed.data.name && parsed.data.name.trim() ? parsed.data.name.trim() : "Default";

    const apiKey = await prisma.userApiKey.create({
      data: {
        userId: session.userId,
        key,
        name,
        policyEnabled: parsed.data.policyEnabled ?? false,
        allowedModels: parsed.data.allowedModels ?? [],
        fallbackProvider: parsed.data.fallbackProvider ?? null,
        fallbackModel: parsed.data.fallbackModel ?? null,
      },
    });

    syncKeysToCliProxyApi().then((result) => {
      if (!result.ok) {
        logger.error({ error: result.error }, "Background sync failed after API key creation");
      }
    }).catch((err) => {
      logger.error({ err }, "Background sync threw unexpected error after API key creation");
    });

    if (apiKey.policyEnabled) {
      syncTokenModelPolicyFile().catch((err) => {
        logger.error({ err }, "Background policy sync failed after API key creation");
      });
    }

    const response: CreateApiKeyResponse = {
      id: apiKey.id,
      key: apiKey.key,
      name: apiKey.name,
      createdAt: apiKey.createdAt.toISOString(),
      syncStatus: "pending",
      syncMessage: "Key created - backend sync in progress",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return Errors.internal("Failed to create API key", error);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const originError = validateOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string") {
      return Errors.missingFields(["id"]);
    }

    const existingKey = await prisma.userApiKey.findFirst({
      where: {
        id,
        userId: session.userId,
      },
      select: { id: true },
    });

    if (!existingKey) {
      return Errors.notFound("API key");
    }

    await prisma.userApiKey.delete({
      where: { id },
    });

    const [syncResult] = await Promise.all([
      syncKeysToCliProxyApi(),
      syncTokenModelPolicyFile().catch((err) => {
        logger.error({ err }, "Background policy sync failed after API key deletion");
        return { ok: false, error: String(err), rulesCount: 0, filePath: "" };
      }),
    ]);
    if (!syncResult.ok) {
      logger.error({ error: syncResult.error }, "Sync failed after API key deletion");
    }

    return apiSuccess({
      syncStatus: syncResult.ok ? "ok" : ("failed" as const),
      syncMessage: syncResult.ok ? undefined : "Backend sync pending - key deleted but may still work temporarily",
    });
  } catch (error) {
    return Errors.internal("Failed to delete API key", error);
  }
}
